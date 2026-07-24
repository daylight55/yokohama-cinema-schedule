import type { MoviePreference } from "../../shared/types";

interface PreferenceRow {
  movie_key: string;
  title: string;
  image_url: string | null;
  starred: number;
  updated_at: string;
}

export async function listStarredPreferences(
  db: D1Database,
): Promise<MoviePreference[]> {
  const result = await db
    .prepare(
      `SELECT movie_key, title, image_url, starred, updated_at
      FROM movie_preferences
      WHERE starred = 1
      ORDER BY updated_at DESC`,
    )
    .all<PreferenceRow>();
  return (result.results ?? []).map((row) => ({
    movieKey: row.movie_key,
    title: row.title,
    imageUrl: row.image_url,
    starred: Boolean(row.starred),
    updatedAt: row.updated_at,
  }));
}
