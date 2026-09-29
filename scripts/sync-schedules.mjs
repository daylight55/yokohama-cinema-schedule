import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Requests originate on this machine; no browser impersonation or proxy rotation.
// Preview by default. --apply explicitly writes the production D1 database.
const { values } = parseArgs({ options: {
  date: { type: 'string' }, source: { type: 'string', multiple: true },
  apply: { type: 'boolean', default: false }, output: { type: 'string' },
} });
const date = values.date;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
  throw new Error('Use --date YYYY-MM-DD');
}
const directory = await mkdtemp(resolve('node_modules/.schedule-sync-'));
let proxy;
try {
  const entry = join(directory, 'collector.mjs');
  await build({ entryPoints: ['worker/src/index.ts'], outfile: entry,
    bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  const { buildSources, refreshBatch, sourceIdsForBatch, sourceDateOutcomes } =
    await import(pathToFileURL(entry).href);
  const { CINEMAS } = await import(pathToFileURL(await bundleCinemas()).href);
  const active = new Set(CINEMAS.filter(c => c.approval !== 'disabled' &&
    (!c.activeUntil || c.activeUntil >= date)).map(c => c.id));
  const ids = new Set(values.source ?? active);
  for (const id of ids) if (!active.has(id)) throw new Error(`Unknown or inactive cinema: ${id}`);
  const report = { date, mode: values.apply ? 'local-to-production' : 'preview',
    startedAt: new Date().toISOString(), results: [] };
  if (values.apply) {
    const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
    const configPath = join(directory, 'wrangler.json');
    await writeFile(configPath, JSON.stringify({ name: 'schedule-local-sync',
      compatibility_date: config.compatibility_date,
      compatibility_flags: ['nodejs_compat'],
      d1_databases: config.d1_databases.map(({ binding, database_name, database_id }) =>
        ({ binding, database_name, database_id, remote: true })),
    }));
    proxy = await getPlatformProxy({ configPath, persist: false });
    for (const batch of [0, 1, 2]) {
      if (sourceIdsForBatch(batch).some(id => ids.has(id))) {
        report.results.push(await refreshBatch({ DB: proxy.env.DB }, batch, ids, new Set([date])));
      }
    }
  } else {
    for (const source of buildSources().filter(s => ids.has(s.id))) {
      try {
        const result = await source.fetch([date]);
        report.results.push({ sourceId: source.id,
          outcomes: sourceDateOutcomes([date], result.showings, result.dateErrors),
          showings: result.showings });
      } catch (error) {
        report.results.push({ sourceId: source.id, error: error.message });
      }
    }
  }
  report.completedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2);
  if (values.output) await writeFile(values.output, json + '\n');
  console.log(json);
  if (report.results.some(r => r.error || r.failed || r.outcomes?.some(o => o.status === 'error'))) {
    process.exitCode = 1;
  }
} finally {
  await proxy?.dispose();
  await rm(directory, { recursive: true, force: true });
}

async function bundleCinemas() {
  const outfile = join(directory, 'cinemas.mjs');
  await build({ entryPoints: ['shared/cinemas.ts'], outfile,
    bundle: true, platform: 'node', format: 'esm' });
  return outfile;
}
