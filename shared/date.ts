const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatJstDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInJst(now = new Date()): string {
  return formatJstDate(now);
}

export function addDays(date: string, amount: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + amount);
  return base.toISOString().slice(0, 10);
}

export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

export function jstDateBounds(date: string): [string, string] {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start.toISOString(), end.toISOString()];
}

export function jstLocalToIso(date: string, time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new RangeError(`Invalid local time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new RangeError(`Invalid local time: ${time}`);
  }
  const midnight = new Date(`${date}T00:00:00+09:00`);
  return new Date(
    midnight.getTime() + (hour * 60 + minute) * 60_000,
  ).toISOString();
}

export function jstEndToIso(
  date: string,
  startTime: string,
  endTime: string,
): string {
  const start = new Date(jstLocalToIso(date, startTime));
  const sameDateEnd = new Date(jstLocalToIso(date, endTime));
  if (sameDateEnd.getTime() >= start.getTime()) return sameDateEnd.toISOString();
  return new Date(sameDateEnd.getTime() + 86_400_000).toISOString();
}

export function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

export function timestampForCacheBuster(now = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS)
    .toISOString()
    .replaceAll(/[-:T]/g, "")
    .slice(0, 12);
}
