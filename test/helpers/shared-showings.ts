import type { DatabaseSync } from "node:sqlite";
import { moviePreferenceKey } from "../../shared/movie";
export function sharedShowing(
  sqlite: DatabaseSync,
  title: string,
  startsAt = new Date(Date.now() + 3600000).toISOString(),
  cinemaId = "sharing-test",
) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,updated_at) VALUES (?, 'Test','Test','yokohama','Test','Test',0,0,'https://example.com','')`,
    )
    .run(cinemaId);
  const id = crypto.randomUUID();
  sqlite
    .prepare(
      `INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES (?,'test',?,?,?,?,'https://example.com','')`,
    )
    .run(id, cinemaId, moviePreferenceKey(title), title, startsAt);
  return id;
}
