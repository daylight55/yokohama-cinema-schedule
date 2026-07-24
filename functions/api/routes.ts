import { todayInJst } from "../../shared/date";
import type {
  Cinema,
  RouteEstimate,
  RoutesResponse,
  TravelMode,
} from "../../shared/types";
import {
  DEFAULT_TRAVEL_MODE,
  listCinemaTravelPreferences,
} from "../_lib/cinema-travel-preferences";
import { listActiveCinemas } from "../_lib/cinemas";
import type { PagesEnv } from "../_lib/env";

interface RouteRequest {
  latitude?: number;
  longitude?: number;
}

interface EstimateProfile {
  distanceFactor: number;
  metersPerMinute: number;
  overheadMinutes: number;
}

const ESTIMATE_PROFILES: Record<TravelMode, EstimateProfile> = {
  walking: {
    distanceFactor: 1.25,
    metersPerMinute: 75,
    overheadMinutes: 0,
  },
  transit: {
    distanceFactor: 1.12,
    metersPerMinute: 450,
    overheadMinutes: 15,
  },
  bus: {
    distanceFactor: 1.25,
    metersPerMinute: 250,
    overheadMinutes: 10,
  },
  bicycle: {
    distanceFactor: 1.18,
    metersPerMinute: 220,
    overheadMinutes: 4,
  },
};

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  let body: RouteRequest;
  try {
    body = await context.request.json<RouteRequest>();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return Response.json({ error: "invalid_location" }, { status: 400 });
  }

  const publicOnly = context.env.PUBLIC_MODE === "true";
  const cinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    publicOnly,
  );
  const preferences = publicOnly
    ? []
    : await listCinemaTravelPreferences(context.env.DB, cinemas);
  const modeByCinema = new Map(
    preferences.map((preference) => [
      preference.cinemaId,
      preference.travelMode,
    ]),
  );
  const routes = cinemas.map((cinema) =>
    estimateRoute(
      latitude,
      longitude,
      cinema,
      modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE,
    ),
  );

  const response: RoutesResponse = {
    generatedAt: new Date().toISOString(),
    provider: "estimate",
    routes,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=120" },
  });
};

export function estimateRoute(
  latitude: number,
  longitude: number,
  cinema: Cinema,
  travelMode: TravelMode,
): RouteEstimate {
  const profile = ESTIMATE_PROFILES[travelMode];
  const straightLineMeters = haversineMeters(
    latitude,
    longitude,
    cinema.latitude,
    cinema.longitude,
  );
  const distanceMeters = Math.round(
    straightLineMeters * profile.distanceFactor,
  );
  const durationMinutes = Math.max(
    1,
    Math.ceil(
      distanceMeters / profile.metersPerMinute + profile.overheadMinutes,
    ),
  );

  return {
    cinemaId: cinema.id,
    distanceMeters,
    durationMinutes,
    mode: "estimate",
    provider: "estimate",
    travelMode,
  };
}

function haversineMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
