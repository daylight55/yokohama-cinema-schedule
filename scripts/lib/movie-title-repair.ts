import reviewed from "../../data/movie-title-corrections/2026-09-27.json" with { type: "json" };
import { movieDisplayTitle, moviePreferenceKey } from "../../shared/movie.ts";
import { showingSearchText } from "../../shared/search.ts";

export interface RepairShowing {
  id: string; source_id: string; cinema_id: string; title: string; movie_key: string;
  starts_at: string; screen: string | null; format: string | null;
  cinema_name: string; cinema_short_name: string;
}
const sql = (value: string | null) => value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;

/** Generate exact, auditable updates from a read-only D1 snapshot. No I/O or writes. */
export function movieTitleRepairSql(rows: RepairShowing[]): string {
  const correction = reviewed.corrections[0];
  const title = correction.canonicalTitle;
  const key = moviePreferenceKey(title);
  const aliases: Readonly<Record<string, string>> = reviewed.legacyMovieKeys;
  const statements: string[] = [];
  for (const row of rows) {
    if (row.movie_key !== key && aliases[row.movie_key] !== key) throw new Error("Unexpected movie key");
    const short = row.movie_key === moviePreferenceKey(correction.observedTitles[0]);
    if (short && (!correction.sourceIds.includes(row.source_id) || !correction.observedTitles.includes(movieDisplayTitle(row.title)))) {
      throw new Error("Unreviewed truncated title/source");
    }
    if (!short && movieDisplayTitle(row.title) !== title) throw new Error("Unreviewed title");
    const expectedId = [row.source_id, row.cinema_id, row.movie_key, row.starts_at, row.screen ?? ""].join("|");
    if (row.id !== expectedId) throw new Error("Unexpected showing ID");
    const id = [row.source_id, row.cinema_id, key, row.starts_at, row.screen ?? ""].join("|");
    // The reviewed truncated T-Joy variant is specifically INFINITY VISION.
    const infinity = short || /INFINITY\s*VISION|インフィニティビジョン/i.test(row.title);
    const format = infinity && !/INFINITY\s*VISION|インフィニティビジョン/i.test(row.format ?? "")
      ? [row.format, "INFINITY VISION"].filter(Boolean).join(" / ") : row.format;
    statements.push(`UPDATE showings SET id=${sql(id)},title=${sql(title)},movie_key=${sql(key)},format=${sql(format)} WHERE id=${sql(row.id)} AND title=${sql(row.title)} AND movie_key=${sql(row.movie_key)};`);
    statements.push(`UPDATE showing_search SET showing_id=${sql(id)},search_text=${sql(showingSearchText(title, row.cinema_name, row.cinema_short_name))} WHERE showing_id=${sql(row.id)};`);
    statements.push(`UPDATE viewing_plans SET showing_id=${sql(id)},title=${sql(title)},movie_key=${sql(key)},format=${sql(format)} WHERE showing_id=${sql(row.id)};`);
    statements.push(`UPDATE movie_marathon_plan_showings SET showing_id=${sql(id)},title=${sql(title)},movie_key=${sql(key)} WHERE showing_id=${sql(row.id)};`);
  }
  for (const alias of Object.keys(aliases)) {
    // Most recently edited preference wins; an equally recent canonical row wins ties.
    statements.push(`INSERT INTO movie_preferences (user_id,movie_key,title,image_url,starred,updated_at,status)
SELECT user_id,${sql(key)},${sql(title)},image_url,starred,updated_at,status FROM movie_preferences WHERE movie_key=${sql(alias)}
ON CONFLICT(user_id,movie_key) DO UPDATE SET title=excluded.title,image_url=COALESCE(excluded.image_url,movie_preferences.image_url),starred=excluded.starred,updated_at=excluded.updated_at,status=excluded.status
WHERE excluded.updated_at > movie_preferences.updated_at;`);
    statements.push(`DELETE FROM movie_preferences WHERE movie_key=${sql(alias)};`);
    // A past saved plan can outlive its corresponding showings row.
    for (const table of ["viewing_plans", "movie_marathon_plan_showings"]) {
      statements.push(`UPDATE ${table} SET title=${sql(title)},movie_key=${sql(key)},showing_id=replace(showing_id,${sql(`|${alias}|`)},${sql(`|${key}|`)}) WHERE movie_key=${sql(alias)};`);
    }
    statements.push(`DELETE FROM reviewed_movie_images WHERE movie_key=${sql(alias)};`);
    statements.push(`DELETE FROM movie_title_research WHERE title_key=${sql(alias)};`);
    statements.push(`DELETE FROM movie_release_dates WHERE title_key=${sql(alias)};`);
  }
  statements.push(`UPDATE movie_title_research SET japanese_title=${sql(title)} WHERE title_key=${sql(key)};`);
  return statements.join("\n") + "\n";
}
