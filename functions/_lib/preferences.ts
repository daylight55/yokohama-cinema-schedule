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
): Promise<MoviePreference[]> {
  const result = await db
    .prepare(
      `SELECT movie_key, title, image_url, starred, status, updated_at
       FROM movie_preferences
       ORDER BY updated_at DESC`,
    )
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
