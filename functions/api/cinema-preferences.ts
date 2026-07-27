import type {
  CinemaTravelPreference,
  TravelMode,
} from "../../shared/types";
import {
  DEFAULT_TRAVEL_MODE,
  isCustomDurationMinutes,
  isTravelMode,
  listCinemaTravelPreferences,
} from "../_lib/cinema-travel-preferences";
import { listActiveCinemas } from "../_lib/cinemas";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import { todayInJst } from "../../shared/date";

interface CinemaPreferenceRequest {
  cinemaId?: string;
  travelMode?: TravelMode;
  customDurationMinutes?: number | null;
}

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "cinema_preferences_unavailable" },
      { status: 403 },
    );
  }

  let body: CinemaPreferenceRequest;
  try {
    body = await context.request.json<CinemaPreferenceRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const cinemaId = body.cinemaId?.trim();
  const hasTravelMode = body.travelMode !== undefined;
  const hasCustomDuration = Object.hasOwn(body, "customDurationMinutes");
  if (
    !cinemaId ||
    (!hasTravelMode && !hasCustomDuration) ||
    (hasTravelMode && !isTravelMode(body.travelMode)) ||
    (hasCustomDuration &&
      body.customDurationMinutes !== null &&
      !isCustomDurationMinutes(body.customDurationMinutes))
  ) {
    return Response.json(
      { error: "invalid_cinema_preference" },
      { status: 400 },
    );
  }

  const cinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    false,
  );
  const cinema = cinemas.find((candidate) => candidate.id === cinemaId);
  if (!cinema) {
    return Response.json({ error: "cinema_not_found" }, { status: 404 });
  }

  const [current] = await listCinemaTravelPreferences(
    context.env.DB,
    [cinema],
    context.data.userId,
  );
  const travelMode =
    body.travelMode ?? current?.travelMode ?? DEFAULT_TRAVEL_MODE;
  const customDurationMinutes = hasCustomDuration
    ? (body.customDurationMinutes ?? null)
    : (current?.customDurationMinutes ?? null);
  const updatedAt = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO cinema_travel_preferences
      (user_id, cinema_id, travel_mode, custom_duration_minutes, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, cinema_id) DO UPDATE SET
       travel_mode = excluded.travel_mode,
       custom_duration_minutes = excluded.custom_duration_minutes,
       updated_at = excluded.updated_at`,
  )
    .bind(
      context.data.userId,
      cinemaId,
      travelMode,
      customDurationMinutes,
      updatedAt,
    )
    .run();

  const preference: CinemaTravelPreference = {
    cinemaId,
    travelMode,
    customDurationMinutes,
    updatedAt,
  };
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json(
      { error: "cinema_preferences_unavailable" },
      { status: 403 },
    );
  }

  const cinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    false,
  );
  const preferences = await listCinemaTravelPreferences(
    context.env.DB,
    cinemas,
    context.data.userId,
  );
  return Response.json(preferences, {
    headers: { "cache-control": "private, no-store" },
  });
};
