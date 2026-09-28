import { dateRange, jstDateBounds, todayInJst } from "../../shared/date";
import {
  collectionIsStale,
  collectionIssue,
  type CollectionStatus,
  type CollectionResult,
} from "../../shared/collection-status";
import type { PagesEnv } from "../_lib/env";

export async function loadCollectionStatus(
  db: D1Database,
  publicOnly: boolean,
  now = new Date(),
): Promise<CollectionStatus> {
  const dates = dateRange(todayInJst(now), 7);
  const approval = publicOnly
    ? "approval = 'approved'"
    : "approval != 'disabled'";
  const [cinemas, health, stored] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, source_url, active_until FROM cinemas WHERE ${approval}
      AND (active_until IS NULL OR active_until >= ?) ORDER BY name`,
      )
      .bind(dates[0])
      .all<{
        id: string;
        name: string;
        source_url: string;
        active_until: string | null;
      }>(),
    db
      .prepare(
        `SELECT source_id, schedule_date, status, showing_count, last_attempt_at, last_success_at, error_message
      FROM source_date_health WHERE schedule_date BETWEEN ? AND ?`,
      )
      .bind(dates[0], dates[6])
      .all<{
        source_id: string;
        schedule_date: string;
        status: CollectionResult;
        showing_count: number;
        last_attempt_at: string;
        last_success_at: string | null;
        error_message: string | null;
      }>(),
    db
      .prepare(
        `SELECT source_id, date(starts_at, '+9 hours') AS schedule_date, COUNT(*) AS count, MAX(fetched_at) AS updated_at
      FROM showings WHERE starts_at >= ? AND starts_at < ? GROUP BY source_id, schedule_date`,
      )
      .bind(jstDateBounds(dates[0])[0], jstDateBounds(dates[6])[1])
      .all<{
        source_id: string;
        schedule_date: string;
        count: number;
        updated_at: string;
      }>(),
  ]);
  const attempts = new Map(
    health.results.map((row) => [`${row.source_id}|${row.schedule_date}`, row]),
  );
  const saved = new Map(
    stored.results.map((row) => [`${row.source_id}|${row.schedule_date}`, row]),
  );
  return {
    generatedAt: now.toISOString(),
    dates,
    cinemas: cinemas.results.map((cinema) => ({
      id: cinema.id,
      name: cinema.name,
      sourceUrl: cinema.source_url,
      activeUntil: cinema.active_until,
      days: dates
        .filter((date) => !cinema.active_until || date <= cinema.active_until)
        .map((date) => {
          const row = attempts.get(`${cinema.id}|${date}`);
          const data = saved.get(`${cinema.id}|${date}`);
          return {
            date,
            status: row?.status ?? "missing",
            stale: collectionIsStale(
              row?.last_attempt_at ?? null,
              now.getTime(),
            ),
            fetchedCount: row?.showing_count ?? 0,
            storedCount: data?.count ?? 0,
            lastAttemptAt: row?.last_attempt_at ?? null,
            lastSuccessAt: row?.last_success_at ?? null,
            storedUpdatedAt: data?.updated_at || null,
            issue: collectionIssue(row?.error_message ?? null),
          };
        }),
    })),
  };
}
export const onRequestGet: PagesFunction<PagesEnv> = async ({ env }) => {
  const status = await loadCollectionStatus(env.DB, env.PUBLIC_MODE === "true");
  return Response.json(status, {
    headers: { "cache-control": "private, no-store" },
  });
};
