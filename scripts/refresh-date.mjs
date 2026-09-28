// Explicit operator command: recheck only one date against the production D1.
// Uses Wrangler login and remote bindings; no public endpoint or trigger secret.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev, unstable_readConfig } from "wrangler";

const date = process.argv[2];
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const last = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86400000)
  .toISOString()
  .slice(0, 10);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
  date < today ||
  date > last ||
  new Date(date).toISOString().slice(0, 10) !== date
) {
  throw new Error(
    `Usage: node scripts/refresh-date.mjs YYYY-MM-DD (within ${today} to ${last}). Writes production D1.`,
  );
}
const source = unstable_readConfig({ config: "worker/wrangler.jsonc" });
const directory = await mkdtemp(join(tmpdir(), "hama-refresh-date-"));
let worker;
try {
  const entry = join(directory, "entry.ts");
  const config = join(directory, "wrangler.json");
  await writeFile(
    entry,
    `import { refreshBatch, sourceIdsForBatch } from ${JSON.stringify(fileURLToPath(new URL("../worker/src/index.ts", import.meta.url)))};
export default { async fetch(request, env) {
 const url = new URL(request.url);
 if (request.method === 'GET') return Response.json([0,1,2].flatMap(batch=>sourceIdsForBatch(batch).map(id=>({batch,id}))));
 try { return Response.json(await refreshBatch(env, Number(url.searchParams.get('batch')), new Set([url.searchParams.get('source')]), new Set([${JSON.stringify(date)}]))); } catch(error) { return Response.json({error:String(error)}, {status:500}); }
}};`,
  );
  await writeFile(
    config,
    JSON.stringify({
      name: "hama-manual-date-check",
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
      browser: { binding: "BROWSER", remote: true },
      vars: { SCHEDULE_DAYS: "7" },
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
  const sources = await (await worker.fetch()).json();
  let failed = 0;
  for (const { batch, id } of sources) {
    // No outer retries. SourceAccessBudget still bounds failures within each cinema.
    const response = await worker.fetch(`/?batch=${batch}&source=${id}`, {
      method: "POST",
    });
    if (!response.ok)
      throw new Error(
        `Refresh request failed for ${id}: HTTP ${response.status}: ${await response.text()}`,
      );
    const result = await response.json();
    failed += result.failed;
    console.log(JSON.stringify({ date, ...result }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (failed) process.exitCode = 1;
} finally {
  await worker?.stop();
  await rm(directory, { recursive: true, force: true });
}
