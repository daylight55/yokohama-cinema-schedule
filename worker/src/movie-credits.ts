import {
  creditFailureReason,
  researchMovieCredits,
} from "../../shared/movie-credits";

export async function refreshMovieCredits(
  db: D1Database,
  request: typeof fetch = fetch,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO movie_credits(title_key,next_attempt_at,updated_at)
    SELECT title_key,?,? FROM movie_title_research WHERE status='verified'`,
    )
    .bind(now, now)
    .run();
  const pending = await db
    .prepare(
      `SELECT c.title_key, r.japanese_title, r.english_title, r.source_url, r.entity_id
    FROM movie_credits c JOIN movie_title_research r ON c.title_key=r.title_key
    WHERE c.status!='verified' AND r.status='verified' AND c.attempts<5 AND c.next_attempt_at<=?
    ORDER BY c.next_attempt_at,c.title_key LIMIT 3`,
    )
    .bind(now)
    .all<{
      title_key: string;
      japanese_title: string;
      english_title: string | null;
      source_url: string | null;
      entity_id: string | null;
    }>();
  for (const row of pending.results) {
    const claimed = await db
      .prepare(
        `UPDATE movie_credits SET attempts=attempts+1,next_attempt_at=?,updated_at=?
      WHERE title_key=? AND status!='verified' AND attempts<5 AND next_attempt_at<=?`,
      )
      .bind(
        new Date(Date.now() + 86_400_000).toISOString(),
        now,
        row.title_key,
        now,
      )
      .run();
    if (claimed.meta.changes !== 1) continue;
    try {
      const credits = await researchMovieCredits(
        {
          japaneseTitle: row.japanese_title,
          englishTitle: row.english_title,
          sourceUrl: row.source_url,
          entityId: row.entity_id,
        },
        request,
      );
      await db
        .prepare(
          `UPDATE movie_credits SET credits_json=?,status=?,updated_at=? WHERE title_key=? AND status!='verified'`,
        )
        .bind(
          credits ? JSON.stringify(credits) : null,
          credits ? "verified" : "unresolved",
          now,
          row.title_key,
        )
        .run();
    } catch (error) {
      // Stop the entire run on upstream failure; the spent attempt and daily lease persist.
      console.warn(
        JSON.stringify({
          event: "movie_credits_paused",
          reason: creditFailureReason(error),
        }),
      );
      break;
    }
  }
}
