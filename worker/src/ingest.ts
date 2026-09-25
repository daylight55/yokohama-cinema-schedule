import { dateRange, todayInJst } from "../../shared/date";
import type { NormalizedShowing } from "../../shared/types";
export const EXTERNAL_SOURCES = ["tjoy-yokohama", "yokohama-burg13"] as const;
export interface CollectionPayload {
  sourceId: string;
  dates: string[];
  showings: NormalizedShowing[];
  dateErrors: [string, string][];
}
const record = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export function validateCollectionPayload(value: unknown): CollectionPayload {
  if (!record(value) || !EXTERNAL_SOURCES.some((id) => id === value.sourceId))
    throw new Error("invalid_source");
  const dates = dateRange(todayInJst(), 7);
  if (
    !Array.isArray(value.dates) ||
    value.dates.length !== 7 ||
    value.dates.some((d, i) => d !== dates[i])
  )
    throw new Error("invalid_dates");
  if (
    !Array.isArray(value.showings) ||
    value.showings.length > 2000 ||
    !Array.isArray(value.dateErrors) ||
    value.dateErrors.length > 7
  )
    throw new Error("invalid_showings");
  for (const row of value.showings) {
    if (
      !record(row) ||
      row.sourceId !== value.sourceId ||
      row.cinemaId !== value.sourceId ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      row.title.length > 500 ||
      typeof row.movieKey !== "string" ||
      row.movieKey.length > 500 ||
      typeof row.startsAt !== "string" ||
      !Number.isFinite(Date.parse(row.startsAt)) ||
      !dates.includes(todayInJst(new Date(row.startsAt))) ||
      !(
        row.endsAt === null ||
        (typeof row.endsAt === "string" &&
          Number.isFinite(Date.parse(row.endsAt)) &&
          Date.parse(row.endsAt) > Date.parse(row.startsAt))
      ) ||
      !(
        row.imageUrl === null ||
        (typeof row.imageUrl === "string" &&
          row.imageUrl.startsWith("https://"))
      ) ||
      !(row.screen === null || typeof row.screen === "string") ||
      !(row.format === null || typeof row.format === "string") ||
      !(row.purchasable === null || typeof row.purchasable === "boolean") ||
      typeof row.bookingUrl !== "string" ||
      !row.bookingUrl.startsWith("https://tjoy.jp/")
    )
      throw new Error("invalid_showing");
  }
  for (const entry of value.dateErrors) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !dates.includes(entry[0]) ||
      typeof entry[1] !== "string" ||
      !entry[1] ||
      entry[1].length > 1000
    )
      throw new Error("invalid_errors");
  }
  return value as unknown as CollectionPayload;
}
export async function readLimitedJson(
  request: Request,
  maxBytes = 1_000_000,
): Promise<unknown> {
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function validBearer(
  request: Request,
  secret?: string,
): Promise<boolean> {
  if (!secret) return false;
  const actual = request.headers.get("authorization") ?? "";
  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([hash(actual), hash(`Bearer ${secret}`)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
