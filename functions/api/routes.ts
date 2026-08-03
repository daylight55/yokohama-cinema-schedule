import { todayInJst } from "../../shared/date";
import type {
  Cinema,
  CinemaTravelPreference,
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
import {
  requireProfileEncryptionKey,
  type AuthContextData,
  type PagesEnv,
} from "../_lib/env";
import {
  estimateStationWalkFallbacks,
  estimateStationTravel,
  listPreferredOriginStationIds,
  listStationConnections,
  listStations,
  type StationWalkEstimate,
} from "../_lib/stations";
import {
  getDepartureLocation,
  listDepartureStationAccess,
  normalizeDepartureCoordinates,
} from "../_lib/user-profile";

interface EstimateProfile {
  distanceFactor: number;
  metersPerMinute: number;
  accessMinutes: number;
  overheadMinutes: number;
  bufferMinutes: number;
}

export const TRANSIT_STATION_WALK_MINUTES = 10;
export const TRANSIT_BUFFER_MINUTES = 10;
export const ORIGIN_STATION_WALK_TOLERANCE_MINUTES = 8;

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

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json({ error: "routes_unavailable" }, { status: 403 });
  }

  const departure = await getDepartureLocation(
    context.env.DB,
    requireProfileEncryptionKey(context.env),
    context.data.userId,
  );
  if (!departure) {
    const response: RoutesResponse = {
      generatedAt: new Date().toISOString(),
      provider: "estimate",
      originRegistered: false,
      origin: null,
      routes: [],
    };
    return Response.json(response, {
      headers: { "cache-control": "private, no-store" },
    });
  }

  const routes = await calculateRoutes(
    context.env.DB,
    context.data.userId,
    departure.latitude,
    departure.longitude,
    true,
  );
  return routeResponse(routes, true, "saved");
};

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") {
    return Response.json({ error: "routes_unavailable" }, { status: 403 });
  }
  let body: { latitude?: unknown; longitude?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const origin = normalizeDepartureCoordinates(body.latitude, body.longitude);
  if (!origin) {
    return Response.json({ error: "invalid_coordinates" }, { status: 400 });
  }
  const routes = await calculateRoutes(
    context.env.DB,
    context.data.userId,
    origin.latitude,
    origin.longitude,
    false,
  );
  return routeResponse(routes, true, "current");
};

async function calculateRoutes(
  db: D1Database,
  userId: string,
  latitude: number,
  longitude: number,
  useStoredStationWalks: boolean,
): Promise<RouteEstimate[]> {
  const cinemas = await listActiveCinemas(
    db,
    todayInJst(),
    false,
  );
  const preferences = await listCinemaTravelPreferences(
    db,
    cinemas,
    userId,
  );
  const modeByCinema = new Map(
    preferences.map((preference) => [
      preference.cinemaId,
      preference.travelMode,
    ]),
  );
  const preferenceByCinema = new Map(
    preferences.map((preference) => [preference.cinemaId, preference]),
  );
  const transitCinemas = cinemas.filter(
    (cinema) =>
      (modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE) === "transit",
  );
  let transitRoutes = new Map<string, RouteEstimate>();
  if (transitCinemas.length > 0) {
    const [stations, connections, preferredOriginStationIds] =
      await Promise.all([
        listStations(db),
        listStationConnections(db),
        listPreferredOriginStationIds(db),
      ]);
    const originStations =
      preferredOriginStationIds.size > 0
        ? stations.filter((station) =>
            preferredOriginStationIds.has(station.id),
          )
        : stations;
    const storedWalks = useStoredStationWalks
      ? await listDepartureStationAccess(
          db,
          new Map(stations.map((station) => [station.id, station])),
          userId,
        )
      : [];
    const storedWalkByStationId = new Map(
      storedWalks.map((walk) => [walk.station.id, walk]),
    );
    const stationWalks = originStations.map(
      (station) =>
        storedWalkByStationId.get(station.id) ??
        estimateStationWalkFallbacks(latitude, longitude, [station])[0],
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
  return cinemas.map((cinema) => {
    const travelMode =
      modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE;
    const route =
      transitRoutes.get(cinema.id) ??
      estimateRoute(latitude, longitude, cinema, travelMode);
    return applyCustomDuration(
      route,
      preferenceByCinema.get(cinema.id)?.customDurationMinutes ?? null,
    );
  });
}

function routeResponse(
  routes: RouteEstimate[],
  originRegistered: boolean,
  origin: RoutesResponse["origin"],
): Response {
  const response: RoutesResponse = {
    generatedAt: new Date().toISOString(),
    provider: "estimate",
    originRegistered,
    origin,
    routes,
  };
  return Response.json(response, {
    headers: { "cache-control": "private, no-store" },
  });
}

export function applyCustomDuration(
  route: RouteEstimate,
  customDurationMinutes: CinemaTravelPreference["customDurationMinutes"],
): RouteEstimate {
  if (customDurationMinutes === null) return route;
  return {
    ...route,
    calculatedDurationMinutes: route.durationMinutes,
    customDurationMinutes,
    durationMinutes: customDurationMinutes,
  };
}

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
