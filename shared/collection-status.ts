export type CollectionResult = "published" | "not_published" | "error";
export const COLLECTION_STALE_MS = 12 * 60 * 60 * 1000;
export interface CollectionDay {
  date: string;
  status: CollectionResult | "missing";
  stale: boolean;
  fetchedCount: number;
  storedCount: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  storedUpdatedAt: string | null;
  issue: "blocked" | "timeout" | "parse" | "unknown" | null;
}
export interface CollectionStatus {
  generatedAt: string;
  dates: string[];
  cinemas: Array<{
    id: string;
    name: string;
    sourceUrl: string;
    activeUntil: string | null;
    days: CollectionDay[];
  }>;
}
export function collectionIssue(
  message: string | null,
): CollectionDay["issue"] {
  if (!message) return null;
  if (/403|429|access denied/i.test(message)) return "blocked";
  if (/timeout|timed out|aborted/i.test(message)) return "timeout";
  if (/parse|markup|invalid|missing|different|解析/i.test(message))
    return "parse";
  return "unknown";
}
export function collectionIsStale(at: string | null, now: number): boolean {
  return (
    at !== null &&
    (!Number.isFinite(Date.parse(at)) ||
      now - Date.parse(at) > COLLECTION_STALE_MS)
  );
}
