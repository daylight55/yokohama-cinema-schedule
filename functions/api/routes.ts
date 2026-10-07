import type {
  Cinema,
  CinemaTravelPreference,
  RouteEstimate,
  Station,
  TravelMode,
} from "../../shared/types";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import { locationFeatureUnavailable } from "../_lib/location-feature";
import {
  estimateStationTravel,
  type StationWalkEstimate,
} from "../_lib/stations";
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

export const onRequestGet: PagesFunction<PagesEnv, string, AuthContextData> =
  async () => locationFeatureUnavailable();
export const onRequestPost: PagesFunction<PagesEnv, string, AuthContextData> =
  async () => locationFeatureUnavailable();

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
