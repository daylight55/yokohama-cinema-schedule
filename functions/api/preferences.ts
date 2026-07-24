import { moviePreferenceKey, safeImageUrl } from "../../shared/movie";
import type { MoviePreference } from "../../shared/types";
import type { PagesEnv } from "../_lib/env";

interface PreferenceRequest {
  title?: string;
  imageUrl?: string | null;
  starred?: boolean;
}

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json({ error: "preferences_unavailable" }, { status: 403 });
  }

  let body: PreferenceRequest;
  try {
    body = await context.request.json<PreferenceRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = body.title?.trim() ?? "";
  if (
    title.length === 0 ||
    title.length > 300 ||
    typeof body.starred !== "boolean"
  ) {
    return Response.json({ error: "invalid_preference" }, { status: 400 });
  }

  const movieKey = moviePreferenceKey(title);
  if (!movieKey || movieKey.length > 300) {
    return Response.json({ error: "invalid_preference" }, { status: 400 });
  }

  const imageUrl = safeImageUrl(body.imageUrl);
  const updatedAt = new Date().toISOString();
  if (body.starred) {
    await context.env.DB.prepare(
      `INSERT INTO movie_preferences (
        movie_key, title, image_url, starred, updated_at
      ) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(movie_key) DO UPDATE SET
        title = excluded.title,
        image_url = COALESCE(excluded.image_url, movie_preferences.image_url),
        starred = 1,
        updated_at = excluded.updated_at`,
    )
      .bind(movieKey, title, imageUrl, updatedAt)
      .run();
  } else {
    await context.env.DB.prepare(
      "DELETE FROM movie_preferences WHERE movie_key = ?",
    )
      .bind(movieKey)
      .run();
  }

  const preference: MoviePreference = {
    movieKey,
    title,
    imageUrl,
    starred: body.starred,
    updatedAt,
  };
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};
