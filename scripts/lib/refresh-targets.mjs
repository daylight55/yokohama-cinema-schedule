import { parseArgs } from "node:util";

export function parseRefreshTargets(args, now = Date.now()) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: "string", multiple: true },
    },
  });
  const [date] = positionals,
    ids = [...new Set(values.source ?? [])];
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const last = new Date(Date.parse(today) + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  if (
    positionals.length !== 1 ||
    !ids.length ||
    ids.some((id) => !id.trim()) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
    date < today ||
    date > last ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw new Error(
      `Usage: node scripts/refresh-date.mjs YYYY-MM-DD --source CINEMA_ID [--source CINEMA_ID] (within ${today} to ${last}). Writes only the selected cinemas/date to production D1.`,
    );
  }
  return { date, ids };
}

export function selectRefreshSources(sources, ids) {
  for (const id of ids) {
    if (!sources.some((source) => source.id === id))
      throw new Error(`Unknown cinema: ${id}`);
  }
  return sources.filter((source) => ids.includes(source.id));
}
