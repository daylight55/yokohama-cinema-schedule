import { CINEMAS } from "../../shared/cinemas";
import type { RouteEstimate, RoutesResponse } from "../../shared/types";
import type { PagesEnv } from "../_lib/env";

interface RouteRequest {
  latitude?: number;
  longitude?: number;
}

interface MatrixResponse {
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

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

  const allowedCinemas = CINEMAS.filter((cinema) =>
    context.env.PUBLIC_MODE === "true"
      ? cinema.approval === "approved"
      : cinema.approval !== "disabled",
  );
  let routes: RouteEstimate[] | null = null;
  if (context.env.ROUTE_MATRIX_API_URL) {
    routes = await fetchRouteMatrix(
      context.env,
      latitude,
      longitude,
      allowedCinemas,
    );
  }
  routes ??= allowedCinemas.map((cinema) => {
    const straightLine = haversineMeters(
      latitude,
      longitude,
      cinema.latitude,
      cinema.longitude,
    );
    const distanceMeters = Math.round(straightLine * 1.25);
    return {
      cinemaId: cinema.id,
      distanceMeters,
      durationMinutes: Math.max(1, Math.ceil(distanceMeters / 75)),
      mode: "estimate" as const,
    };
  });

  const response: RoutesResponse = {
    generatedAt: new Date().toISOString(),
    routes,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=120" },
  });
};

async function fetchRouteMatrix(
  env: PagesEnv,
  latitude: number,
  longitude: number,
  cinemas: typeof CINEMAS,
): Promise<RouteEstimate[] | null> {
  try {
    const response = await fetch(env.ROUTE_MATRIX_API_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.ROUTE_MATRIX_API_KEY
          ? { authorization: env.ROUTE_MATRIX_API_KEY }
          : {}),
      },
      body: JSON.stringify({
        locations: [
          [longitude, latitude],
          ...cinemas.map((cinema) => [cinema.longitude, cinema.latitude]),
        ],
        sources: [0],
        destinations: cinemas.map((_, index) => index + 1),
        metrics: ["distance", "duration"],
      }),
    });
    if (!response.ok) return null;
    const matrix = await response.json<MatrixResponse>();
    const durations = matrix.durations?.[0];
    const distances = matrix.distances?.[0];
    if (!durations || !distances) return null;
    return cinemas.map((cinema, index) => ({
      cinemaId: cinema.id,
      distanceMeters: Math.round(distances[index] ?? 0),
      durationMinutes: Math.max(1, Math.ceil((durations[index] ?? 0) / 60)),
      mode: "route",
    }));
  } catch {
    return null;
  }
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
  return 2 * radius * Math.asin(Math.sqrt(a));
}
