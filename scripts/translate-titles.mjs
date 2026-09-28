// Wrangler-authenticated audit/backfill against production D1 + Workers AI.
// No public endpoint, trigger token, or browser-side model calls.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev, unstable_readConfig } from "wrangler";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const batchesIndex = args.indexOf("--batches");
const batches = batchesIndex < 0 ? 1 : Number(args[batchesIndex + 1]);
const remaining = args.filter(
  (arg, i) =>
    arg !== "--apply" &&
    !(batchesIndex >= 0 && (i === batchesIndex || i === batchesIndex + 1)),
);
if (
  remaining.length ||
  !Number.isInteger(batches) ||
  batches < 1 ||
  batches > 5
)
  throw new Error(
    "Usage: node scripts/translate-titles.mjs [--apply] [--batches 1..5]. Default: read-only production audit.",
  );

const source = unstable_readConfig({ config: "worker/wrangler.jsonc" });
const directory = await mkdtemp(join(tmpdir(), "hama-title-backfill-"));
const modulePath = (path) =>
  JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
let worker;
try {
  const entry = join(directory, "entry.ts"),
    config = join(directory, "wrangler.json");
  await writeFile(
    entry,
    `
import {refreshMovieTitleResearch} from ${modulePath("../worker/src/title-research.ts")};
import {refreshMovieTitleTranslations} from ${modulePath("../worker/src/title-translation.ts")};
import {listMovieTitles} from ${modulePath("../functions/_lib/movie-titles.ts")};
import {moviePreferenceKey} from ${modulePath("../shared/movie.ts")};
export default {async fetch(request,env) {
  if(request.method==='POST') {
    if(new URL(request.url).pathname==='/research') {
      await refreshMovieTitleResearch(env.DB,env.AI);
      return Response.json({research:'complete'});
    }
    return Response.json(await refreshMovieTitleTranslations(env.DB,env.AI));
  }
  const active=await env.DB.prepare('SELECT DISTINCT title FROM showings WHERE starts_at>=?').bind(new Date().toISOString()).all();
  const catalog=new Map((await listMovieTitles(env.DB)).map(row=>[row.titleKey,row]));
  const keys=new Map(active.results.map(row=>[moviePreferenceKey(row.title),row.title]));
  const films=[...keys].map(([key,title])=>({title,englishTitle:catalog.get(key)?.englishTitle??null,sourceKind:catalog.get(key)?.sourceKind??null}));
  const queue=await env.DB.prepare("SELECT title_key,attempts,last_error,next_attempt_at FROM movie_title_translations WHERE status!='translated'").all();
  return Response.json({total:films.length,covered:films.filter(row=>row.englishTitle).length,missing:films.filter(row=>!row.englishTitle),translations:films.filter(row=>row.englishTitle&&row.sourceKind==='machine_translation'),failures:queue.results});
}};`,
  );
  await writeFile(
    config,
    JSON.stringify({
      name: "hama-title-backfill",
      main: entry,
      compatibility_date: source.compatibility_date,
      compatibility_flags: source.compatibility_flags,
      d1_databases: source.d1_databases.map((binding) => ({
        binding: binding.binding,
        database_name: binding.database_name,
        database_id: binding.database_id,
        preview_database_id: binding.database_id,
        remote: true,
      })),
      ai: { binding: "AI" },
    }),
  );
  worker = await unstable_dev(entry, {
    config,
    local: false,
    ip: "127.0.0.1",
    port: 0,
    inspectorPort: 0,
    logLevel: "error",
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
      watch: false,
    },
  });
  async function request(path = "/", method = "GET") {
    const response = await worker.fetch(path, { method });
    if (!response.ok)
      throw new Error(`Title job failed: HTTP ${response.status}`);
    return response.json();
  }
  console.log(JSON.stringify({ stage: "before", ...(await request()) }));
  if (apply)
    for (let i = 0; i < batches; i++) {
      await request("/research", "POST");
      const result = await request("/translate", "POST");
      console.log(JSON.stringify({ batch: i + 1, ...result }));
      // Stop service outages, but let other films proceed after rejected content.
      if (!result.attempted || result.paused) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  console.log(JSON.stringify({ stage: "after", ...(await request()) }));
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
