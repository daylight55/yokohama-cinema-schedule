import type { MoviePreference } from "../../shared/types";

interface PreferenceRow {
  movie_key: string;
  title: string;
  image_url: string | null;
  starred: number;
  status: MoviePreference["status"];
  updated_at: string;
}

export async function listMoviePreferences(
  db: D1Database,
  userId = "legacy-local",
): Promise<MoviePreference[]> {
  const result = await db
    .prepare(
      `SELECT movie_key, title, image_url, starred, status, updated_at
       FROM movie_preferences
      WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<PreferenceRow>();
  return (result.results ?? []).map((row) => ({
    movieKey: row.movie_key,
    title: row.title,
    imageUrl: row.image_url,
    starred: Boolean(row.starred),
    status: row.status,
    updatedAt: row.updated_at,
  }));
}
