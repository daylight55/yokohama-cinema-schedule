import type {
  CinemaTravelPreference,
  TravelMode,
} from "../../shared/types";
import {
  isTravelMode,
  listCinemaTravelPreferences,
} from "../_lib/cinema-travel-preferences";
import { listActiveCinemas } from "../_lib/cinemas";
import type { PagesEnv } from "../_lib/env";
import { todayInJst } from "../../shared/date";

interface CinemaPreferenceRequest {
  cinemaId?: string;
  travelMode?: TravelMode;
}

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
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
  if (!cinemaId || !isTravelMode(body.travelMode)) {
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

  const updatedAt = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO cinema_travel_preferences
      (cinema_id, travel_mode, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cinema_id) DO UPDATE SET
       travel_mode = excluded.travel_mode,
       updated_at = excluded.updated_at`,
  )
    .bind(cinemaId, body.travelMode, updatedAt)
    .run();

  const preference: CinemaTravelPreference = {
    cinemaId,
    travelMode: body.travelMode,
    updatedAt,
  };
  return Response.json(preference, {
    headers: { "cache-control": "private, no-store" },
  });
};
export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
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
  );
  return Response.json(preferences, {
    headers: { "cache-control": "private, no-store" },
  });
};
