#!/usr/bin/env node
// A review gate, not a claim that hashes can judge visual equivalence.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const RECORD = "scripts/site-guide/ui-review.json";
const INPUT_TREES = [
  "src",
  "shared",
  "public/brand",
  "scripts/site-guide/mascot",
];
const INPUT_FILES = [
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "public/base-theme.css",
  "public/page-layout.css",
  "scripts/site-guide/capture.mjs",
  "scripts/site-guide/capture-fixture.mjs",
  "scripts/site-guide/render.py",
  "scripts/site-guide/music.py",
  "functions/api/account/index.ts",
  "functions/api/account/profile.ts",
  "functions/api/member-page.ts",
  "functions/api/sharing.ts",
  "functions/api/notifications.ts",
];
const REQUIRED_ARTIFACTS = [
  "scripts/site-guide/captures/manifest.json",
  ...["ja", "en"].flatMap((lang) =>
    ["mp4", "webp", "vtt"].map((ext) => `public/guide/how-to-${lang}.${ext}`),
  ),
];
async function walk(root, relative) {
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return (
    await Promise.all(
      entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => {
          const file = `${relative}/${e.name}`;
          return e.isDirectory() ? walk(root, file) : [file];
        }),
    )
  ).flat();
}
async function hashes(root, files) {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(files)].sort().map(async (file) => {
        try {
          return [
            file,
            createHash("sha256")
              .update(await readFile(path.join(root, file)))
              .digest("hex"),
          ];
        } catch (error) {
          if (error.code === "ENOENT") return [file, null];
          throw error;
        }
      }),
    ),
  );
}
export async function snapshot(root = ROOT) {
  return {
    inputs: await hashes(root, [
      ...INPUT_FILES,
      ...(await Promise.all(INPUT_TREES.map((p) => walk(root, p)))).flat(),
    ]),
    artifacts: await hashes(root, [
      ...REQUIRED_ARTIFACTS,
      ...(await walk(root, "scripts/site-guide/captures")),
    ]),
  };
}
export function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((p) => before[p] !== after[p]);
}
export function verifyRecord(record, current) {
  const problems = [];
  if (
    record?.version !== 1 ||
    !record.review?.note?.trim() ||
    !["recaptured", "visually-unchanged"].includes(record.review?.outcome)
  )
    problems.push("Missing or invalid guide review record.");
  for (const kind of ["inputs", "artifacts"]) {
    const changed = changedFiles(record?.[kind] || {}, current[kind]);
    if (changed.length)
      problems.push(
        `${kind} changed since the guide review:\n${changed.map((p) => `  ${p}`).join("\n")}`,
      );
  }
  for (const file of REQUIRED_ARTIFACTS)
    if (!current.artifacts[file])
      problems.push(`Missing published guide asset: ${file}`);
  return problems;
}
async function main() {
  const [command = "check", ...args] = process.argv.slice(2);
  const current = await snapshot();
  if (command === "check") {
    let record;
    try {
      record = JSON.parse(await readFile(path.join(ROOT, RECORD), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const problems = verifyRecord(record, current);
    if (problems.length)
      throw new Error(
        `${problems.join("\n")}\nReview both videos against the current UI. Recapture affected scenes and render if needed, then run guide:review with a concrete note. See AGENTS.md and scripts/site-guide/README.md.`,
      );
    console.log(
      "Guide UI freshness: reviewed inputs and published assets match.",
    );
  } else if (command === "review") {
    const option = (flag) => {
      const i = args.indexOf(flag);
      return i < 0 ? "" : args[i + 1] || "";
    };
    const note = option("--note").trim();
    const recaptured = option("--recaptured").split(",").filter(Boolean);
    const unchanged = args.includes("--unchanged-visuals");
    if (note.length < 20 || unchanged === recaptured.length > 0)
      throw new Error(
        'Use --note "concrete JP/EN review evidence (20+ characters)" and either --recaptured scene1,scene2 or --unchanged-visuals. Never acknowledge changes without reviewing them.',
      );
    const manifest = JSON.parse(
      await readFile(
        path.join(ROOT, "scripts/site-guide/captures/manifest.json"),
        "utf8",
      ),
    );
    for (const lang of ["ja", "en"])
      for (const scene of recaptured) {
        if (
          !manifest.languages[lang].some(
            (s) => s.name === scene && s.kind === "screen",
          )
        )
          throw new Error(`Unknown captured scene: ${lang}/${scene}`);
      }
    for (const file of REQUIRED_ARTIFACTS)
      if (!current.artifacts[file])
        throw new Error(`Missing guide asset: ${file}`);
    const record = {
      version: 1,
      review: {
        reviewedAt: new Date().toISOString(),
        baseRevision: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim(),
        outcome: unchanged ? "visually-unchanged" : "recaptured",
        scenes: recaptured,
        note,
      },
      ...current,
    };
    await writeFile(
      path.join(ROOT, RECORD),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    console.log(`Recorded explicit guide review in ${RECORD}.`);
  } else throw new Error(`Unknown command: ${command}`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
