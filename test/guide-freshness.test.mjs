import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { snapshot, verifyRecord } from "../scripts/site-guide/freshness.mjs";
it("blocks changed, added and deleted UI inputs and replaced or missing published media", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "guide-freshness-"));
  const put = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  try {
    await put("src/App.tsx", "original UI");
    await put("scripts/site-guide/captures/manifest.json", "{}");
    for (const lang of ["ja", "en"])
      for (const ext of ["mp4", "webp", "vtt"])
        await put(`public/guide/how-to-${lang}.${ext}`, "original media");
    const record = {
      version: 1,
      review: { note: "Reviewed both language guides", outcome: "recaptured" },
      ...(await snapshot(root)),
    };
    expect(verifyRecord(record, await snapshot(root))).toEqual([]);
    await put("AGENTS.md", "Documentation changes do not alter captured UI");
    await put("test/example.test.ts", "test-only change");
    expect(verifyRecord(record, await snapshot(root))).toEqual([]);
    await put("scripts/site-guide/captures/new-screen.png", "new capture");
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "new-screen.png",
    );
    await rm(path.join(root, "scripts/site-guide/captures/new-screen.png"));
    await put("src/App.tsx", "profile menu replaces notification bell");
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "src/App.tsx",
    );
    await put("src/App.tsx", "original UI");
    await put("src/NewHeader.tsx", "new component");
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "src/NewHeader.tsx",
    );
    await rm(path.join(root, "src/NewHeader.tsx"));
    await rm(path.join(root, "src/App.tsx"));
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "src/App.tsx",
    );
    await put("src/App.tsx", "original UI");
    await put("public/guide/how-to-en.mp4", "different video");
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "public/guide/how-to-en.mp4",
    );
    await rm(path.join(root, "public/guide/how-to-ja.mp4"));
    expect(verifyRecord(record, await snapshot(root)).join("\n")).toContain(
      "Missing published guide asset: public/guide/how-to-ja.mp4",
    );
    expect(verifyRecord({}, await snapshot(root)).join("\n")).toContain(
      "Missing or invalid guide review",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
