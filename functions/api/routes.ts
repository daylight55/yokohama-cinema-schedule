import { todayInJst } from "../../shared/date";
import type { Cinema, RouteEstimate, RoutesResponse } from "../../shared/types";
import { listActiveCinemas } from "../_lib/cinemas";
import type { PagesEnv } from "../_lib/env";

interface RouteRequest {
  latitude?: number;
  longitude?: number;
}

interface MatrixResponse {
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
}

interface GoogleMatrixElement {
  destinationIndex?: number;
  condition?: string;
  distanceMeters?: number;
  duration?: string;
  status?: { code?: number; message?: string };
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

  const allowedCinemas = await listActiveCinemas(
    context.env.DB,
    todayInJst(),
    context.env.PUBLIC_MODE === "true",
  );
  let routes: RouteEstimate[] | null = null;
  if (context.env.GOOGLE_MAPS_API_KEY) {
    routes = await fetchGoogleRouteMatrix(
      context.env.GOOGLE_MAPS_API_KEY,
      latitude,
      longitude,
      allowedCinemas,
    );
  } else if (context.env.ROUTE_MATRIX_API_URL) {
    routes = await fetchRouteMatrix(
      context.env,
      latitude,
      longitude,
      allowedCinemas,
    );
  }
  const routeByCinema = new Map(
    (routes ?? []).map((route) => [route.cinemaId, route]),
  );
  routes = allowedCinemas.map(
    (cinema) =>
      routeByCinema.get(cinema.id) ??
      estimateWalkingRoute(latitude, longitude, cinema),
  );

  const response: RoutesResponse = {
    generatedAt: new Date().toISOString(),
    provider:
      routes.find((route) => route.provider !== "estimate")?.provider ??
      "estimate",
    routes,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=120" },
  });
};

export async function fetchGoogleRouteMatrix(
  apiKey: string,
  latitude: number,
  longitude: number,
  cinemas: Cinema[],
): Promise<RouteEstimate[] | null> {
  if (cinemas.length === 0) return [];
  try {
    const response = await fetch(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask":
            "destinationIndex,duration,distanceMeters,status,condition",
        },
        body: JSON.stringify({
          origins: [
            {
              waypoint: {
                location: {
                  latLng: { latitude, longitude },
                },
              },
            },
          ],
          destinations: cinemas.map((cinema) => ({
            waypoint: {
              location: {
                latLng: {
                  latitude: cinema.latitude,
                  longitude: cinema.longitude,
                },
              },
            },
          })),
          travelMode: "TRANSIT",
        }),
      },
    );
    if (!response.ok) return null;
    const matrix = await response.json<GoogleMatrixElement[]>();
    const byDestination = new Map(
      matrix
        .filter(
          (element) =>
            element.condition === "ROUTE_EXISTS" &&
            (element.status?.code === undefined || element.status.code === 0),
        )
        .map((element) => [element.destinationIndex, element]),
    );
    const routes = cinemas.flatMap((cinema, index) => {
      const element = byDestination.get(index);
      const durationSeconds = parseGoogleDuration(element?.duration);
      if (!element || durationSeconds === null) return [];
      return [
        {
          cinemaId: cinema.id,
          distanceMeters: Math.round(element.distanceMeters ?? 0),
          durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
          mode: "route" as const,
          provider: "google_maps" as const,
          travelMode: "transit" as const,
        },
      ];
    });
    return routes.length > 0 ? routes : null;
  } catch {
    return null;
  }
}

export function parseGoogleDuration(
  value: string | undefined,
): number | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

async function fetchRouteMatrix(
  env: PagesEnv,
  latitude: number,
  longitude: number,
  cinemas: Cinema[],
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
      provider: "custom",
      travelMode: "walking",
    }));
  } catch {
    return null;
  }
}

export function estimateWalkingRoute(
  latitude: number,
  longitude: number,
  cinema: Cinema,
): RouteEstimate {
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
    mode: "estimate",
    provider: "estimate",
    travelMode: "walking",
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
  return 2 * radius * Math.asin(Math.sqrt(a));
}
