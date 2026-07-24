import { todayInJst } from "../../shared/date";
import type {
  Cinema,
  RouteEstimate,
  RoutesResponse,
  Station,
  TravelMode,
} from "../../shared/types";
import {
  DEFAULT_TRAVEL_MODE,
  listCinemaTravelPreferences,
} from "../_lib/cinema-travel-preferences";
import { listActiveCinemas } from "../_lib/cinemas";
import type { PagesEnv } from "../_lib/env";
import {
  estimateStationTravel,
  listPreferredOriginStationIds,
  listStationConnections,
  listStations,
} from "../_lib/stations";

interface RouteRequest {
  latitude?: number;
  longitude?: number;
}

interface EstimateProfile {
  distanceFactor: number;
  metersPerMinute: number;
  accessMinutes: number;
  overheadMinutes: number;
  bufferMinutes: number;
}

interface StationWalkEstimate {
  station: Station;
  distanceMeters: number;
  durationMinutes: number;
  provider: "google_maps" | "estimate";
}

interface GoogleRouteMatrixElement {
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
  status?: { code?: number };
}

export const TRANSIT_STATION_WALK_MINUTES = 10;
export const TRANSIT_BUFFER_MINUTES = 10;
export const ORIGIN_STATION_WALK_TOLERANCE_MINUTES = 8;
const GOOGLE_ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const ESTIMATE_PROFILES: Record<TravelMode, EstimateProfile> = {
  walking: {
    distanceFactor: 1.25,
    metersPerMinute: 75,
    accessMinutes: 0,
    overheadMinutes: 0,
    bufferMinutes: 0,
  },
  transit: {
    distanceFactor: 1.12,
    metersPerMinute: 450,
    accessMinutes: TRANSIT_STATION_WALK_MINUTES,
    overheadMinutes: 5,
    bufferMinutes: TRANSIT_BUFFER_MINUTES,
  },
  bus: {
    distanceFactor: 1.25,
    metersPerMinute: 250,
    accessMinutes: 5,
    overheadMinutes: 5,
    bufferMinutes: 0,
  },
  bicycle: {
    distanceFactor: 1.18,
    metersPerMinute: 220,
    accessMinutes: 0,
    overheadMinutes: 4,
    bufferMinutes: 0,
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
  const transitCinemas = cinemas.filter(
    (cinema) =>
      (modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE) === "transit",
  );
  let transitRoutes = new Map<string, RouteEstimate>();
  if (transitCinemas.length > 0) {
    const [stations, connections, preferredOriginStationIds] = await Promise.all([
      listStations(context.env.DB),
      listStationConnections(context.env.DB),
      listPreferredOriginStationIds(context.env.DB),
    ]);
    const originStations =
      preferredOriginStationIds.size > 0
        ? stations.filter((station) =>
            preferredOriginStationIds.has(station.id),
          )
        : stations;
    const stationWalks = await estimateWalksToStations(
      latitude,
      longitude,
      originStations,
      context.env.GOOGLE_MAPS_API_KEY,
    );
    transitRoutes = buildTransitRoutes(
      latitude,
      longitude,
      transitCinemas,
      stationWalks,
      stations,
      connections,
      preferredOriginStationIds,
    );
  }
  const routes = cinemas.map((cinema) => {
    const travelMode =
      modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE;
    return (
      transitRoutes.get(cinema.id) ??
      estimateRoute(latitude, longitude, cinema, travelMode)
    );
  });

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
      distanceMeters / profile.metersPerMinute +
        profile.accessMinutes +
        profile.overheadMinutes +
        profile.bufferMinutes,
    ),
  );

  return {
    cinemaId: cinema.id,
    distanceMeters,
    durationMinutes,
    accessMinutes: profile.accessMinutes,
    bufferMinutes: profile.bufferMinutes,
    mode: "estimate",
    provider: "estimate",
    travelMode,
  };
}

export async function estimateWalksToStations(
  latitude: number,
  longitude: number,
  stations: Station[],
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<StationWalkEstimate[]> {
  if (!apiKey || stations.length === 0) {
    return estimateStationWalkFallbacks(latitude, longitude, stations);
  }

  try {
    const response = await fetcher(GOOGLE_ROUTE_MATRIX_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask":
          "originIndex,destinationIndex,distanceMeters,duration,condition,status",
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
        destinations: stations.map((station) => ({
          waypoint: {
            location: {
              latLng: {
                latitude: station.latitude,
                longitude: station.longitude,
              },
            },
          },
        })),
        travelMode: "WALK",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return estimateStationWalkFallbacks(latitude, longitude, stations);
    }

    const payload = await response.json<GoogleRouteMatrixElement[]>();
    const routeByDestination = new Map(
      payload
        .filter(
          (item) =>
            item.condition === "ROUTE_EXISTS" &&
            (item.status?.code ?? 0) === 0 &&
            item.destinationIndex !== undefined,
        )
        .map((item) => [item.destinationIndex!, item]),
    );
    return stations.map((station, index) => {
      const route = routeByDestination.get(index);
      const durationSeconds = parseGoogleDurationSeconds(route?.duration);
      if (
        !route ||
        route.distanceMeters === undefined ||
        durationSeconds === null
      ) {
        return estimateStationWalkFallback(latitude, longitude, station);
      }
      return {
        station,
        distanceMeters: route.distanceMeters,
        durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        provider: "google_maps" as const,
      };
    });
  } catch {
    return estimateStationWalkFallbacks(latitude, longitude, stations);
  }
}

export function buildTransitRoutes(
  latitude: number,
  longitude: number,
  cinemas: Cinema[],
  stationWalks: StationWalkEstimate[],
  stations: Station[],
  connections: Parameters<typeof estimateStationTravel>[2],
  preferredOriginStationIds = new Set<string>(),
): Map<string, RouteEstimate> {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const minimumWalkMinutes = Math.min(
    ...stationWalks.map((walk) => walk.durationMinutes),
  );
  const preferredOriginCandidates = stationWalks.filter((walk) =>
    preferredOriginStationIds.has(walk.station.id),
  );
  const originCandidates =
    preferredOriginCandidates.length > 0
      ? preferredOriginCandidates
      : stationWalks.filter(
          (walk) =>
            walk.durationMinutes <=
            minimumWalkMinutes + ORIGIN_STATION_WALK_TOLERANCE_MINUTES,
        );
  const routes = new Map<string, RouteEstimate>();

  for (const cinema of cinemas) {
    const destinationStation = cinema.nearestStationId
      ? stationById.get(cinema.nearestStationId)
      : undefined;
    if (
      !destinationStation ||
      cinema.stationWalkMinutes === null ||
      cinema.stationWalkMinutes === undefined
    ) {
      continue;
    }

    const candidates = originCandidates
      .map((originWalk) => {
        const stationTravel = estimateStationTravel(
          originWalk.station.id,
          destinationStation.id,
          connections,
        );
        return stationTravel
          ? {
              originWalk,
              stationTravel,
              totalMinutes:
                originWalk.durationMinutes +
                stationTravel.minutes +
                cinema.stationWalkMinutes!,
            }
          : null;
      })
      .filter((candidate) => candidate !== null)
      .sort((left, right) => left.totalMinutes - right.totalMinutes);
    const best = candidates[0];
    if (!best) {
      continue;
    }

    const bufferMinutes = TRANSIT_BUFFER_MINUTES;
    routes.set(cinema.id, {
      cinemaId: cinema.id,
      distanceMeters: Math.round(
        haversineMeters(
          latitude,
          longitude,
          cinema.latitude,
          cinema.longitude,
        ),
      ),
      durationMinutes: best.totalMinutes + bufferMinutes,
      accessMinutes:
        best.originWalk.durationMinutes + cinema.stationWalkMinutes,
      bufferMinutes,
      mode: "estimate",
      provider: "custom",
      travelMode: "transit",
      transitDetails: {
        originStationId: best.originWalk.station.id,
        originStationName: best.originWalk.station.name,
        destinationStationId: destinationStation.id,
        destinationStationName: destinationStation.name,
        originWalkMinutes: best.originWalk.durationMinutes,
        stationTravelMinutes: best.stationTravel.minutes,
        destinationWalkMinutes: cinema.stationWalkMinutes,
        bufferMinutes,
        lines: best.stationTravel.lines,
        originWalkProvider: best.originWalk.provider,
      },
    });
  }

  return routes;
}

function estimateStationWalkFallbacks(
  latitude: number,
  longitude: number,
  stations: Station[],
): StationWalkEstimate[] {
  return stations.map((station) =>
    estimateStationWalkFallback(latitude, longitude, station),
  );
}

function estimateStationWalkFallback(
  latitude: number,
  longitude: number,
  station: Station,
): StationWalkEstimate {
  const distanceMeters = Math.round(
    haversineMeters(
      latitude,
      longitude,
      station.latitude,
      station.longitude,
    ) * 1.25,
  );
  return {
    station,
    distanceMeters,
    durationMinutes: Math.max(1, Math.ceil(distanceMeters / 75)),
    provider: "estimate",
  };
}

function parseGoogleDurationSeconds(value: string | undefined): number | null {
  const match = value?.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
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
