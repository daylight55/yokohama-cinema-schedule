import {
  isMoviePreferenceStatus,
  moviePreferenceKey,
  safeImageUrl,
} from "../../shared/movie";
import type {
  MoviePreference,
  MoviePreferenceStatus,
} from "../../shared/types";
import type { AuthContextData, PagesEnv } from "../_lib/env";

interface PreferenceRequest {
  title?: string;
  imageUrl?: string | null;
  starred?: boolean;
  status?: MoviePreferenceStatus | null;
}

interface PreferenceRow {
  movie_key: string;
  title: string;
  image_url: string | null;
  starred: number;
  status: MoviePreferenceStatus | null;
  updated_at: string;
}

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "preferences_unavailable" },
      { status: 403 },
    );
  }

  let body: PreferenceRequest;
  try {
    body = await context.request.json<PreferenceRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = body.title?.trim() ?? "";
  const starredProvided = typeof body.starred === "boolean";
  const statusProvided = Object.hasOwn(body, "status");
  const validStatus =
    body.status === null || isMoviePreferenceStatus(body.status);
  if (
    title.length === 0 ||
    title.length > 300 ||
    (!starredProvided && !statusProvided) ||
    (statusProvided && !validStatus)
  ) {
    return Response.json(
      { error: "invalid_preference" },
      { status: 400 },
    );
  }

  const movieKey = moviePreferenceKey(title);
  if (!movieKey || movieKey.length > 300) {
    return Response.json(
      { error: "invalid_preference" },
      { status: 400 },
    );
  }

  const imageUrl = safeImageUrl(body.imageUrl);
  const updatedAt = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO movie_preferences (
       user_id, movie_key, title, image_url, starred, status, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, movie_key) DO UPDATE SET
       title = excluded.title,
       image_url = COALESCE(excluded.image_url, movie_preferences.image_url),
       starred = CASE
         WHEN ? = 1 THEN excluded.starred
         ELSE movie_preferences.starred
       END,
       status = CASE
         WHEN ? = 1 THEN excluded.status
         ELSE movie_preferences.status
       END,
       updated_at = excluded.updated_at`,
  )
    .bind(
      context.data.userId,
      movieKey,
      title,
      imageUrl,
      body.starred ? 1 : 0,
      statusProvided ? body.status : null,
      updatedAt,
      starredProvided ? 1 : 0,
      statusProvided ? 1 : 0,
    )
    .run();

  await context.env.DB.prepare(
    `DELETE FROM movie_preferences
     WHERE movie_key = ?
       AND user_id = ?
       AND starred = 0
       AND status IS NULL`,
  )
    .bind(movieKey, context.data.userId)
    .run();

  const row = await context.env.DB.prepare(
    `SELECT movie_key, title, image_url, starred, status, updated_at
     FROM movie_preferences
     WHERE movie_key = ?
       AND user_id = ?`,
  )
    .bind(movieKey, context.data.userId)
    .first<PreferenceRow>();
  const preference: MoviePreference = row
    ? {
        movieKey: row.movie_key,
        title: row.title,
        imageUrl: row.image_url,
        starred: Boolean(row.starred),
        status: row.status,
        updatedAt: row.updated_at,
      }
    : {
        movieKey,
        title,
        imageUrl,
        starred: false,
        status: null,
        updatedAt,
      };
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};
