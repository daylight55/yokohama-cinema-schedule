import type { Station, StationConnection } from "../../shared/types";

interface GoogleRouteMatrixElement {
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
  status?: { code?: number };
}

interface StationRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface StationConnectionRow {
  station_a_id: string;
  station_b_id: string;
  line_name: string;
  transport_mode: StationConnection["transportMode"];
  ride_minutes: number;
  headway_minutes: number;
  transfer_minutes: number;
}

export interface StationTravelEstimate {
  minutes: number;
  lines: string[];
}

export interface StationWalkEstimate {
  station: Station;
  distanceMeters: number;
  durationMinutes: number;
  provider: "google_maps" | "estimate";
}

const GOOGLE_ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export async function listStations(db: D1Database): Promise<Station[]> {
  const result = await db
    .prepare(
      `SELECT id, name, latitude, longitude
       FROM stations
       ORDER BY name`,
    )
    .all<StationRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

export async function listStationConnections(
  db: D1Database,
): Promise<StationConnection[]> {
  const result = await db
    .prepare(
      `SELECT station_a_id, station_b_id, line_name, transport_mode,
              ride_minutes, headway_minutes, transfer_minutes
       FROM station_connections`,
    )
    .all<StationConnectionRow>();
  return (result.results ?? []).map((row) => ({
    stationAId: row.station_a_id,
    stationBId: row.station_b_id,
    lineName: row.line_name,
    transportMode: row.transport_mode,
    rideMinutes: row.ride_minutes,
    headwayMinutes: row.headway_minutes,
    transferMinutes: row.transfer_minutes,
  }));
}

export async function listPreferredOriginStationIds(
  db: D1Database,
): Promise<Set<string>> {
  const result = await db
    .prepare("SELECT station_id FROM preferred_origin_stations")
    .all<{ station_id: string }>();
  return new Set((result.results ?? []).map((row) => row.station_id));
}

export function estimateStationTravel(
  originStationId: string,
  destinationStationId: string,
  connections: StationConnection[],
): StationTravelEstimate | null {
  if (originStationId === destinationStationId) {
    return { minutes: 0, lines: [] };
  }

  interface SearchState {
    stationId: string;
    currentLine: string | null;
    minutes: number;
    lines: string[];
  }

  const queue: SearchState[] = [
    {
      stationId: originStationId,
      currentLine: null,
      minutes: 0,
      lines: [],
    },
  ];
  const bestByState = new Map<string, number>();

  while (queue.length > 0) {
    queue.sort((left, right) => left.minutes - right.minutes);
    const current = queue.shift()!;
    const stateKey = `${current.stationId}:${current.currentLine ?? ""}`;
    if (
      (bestByState.get(stateKey) ?? Number.POSITIVE_INFINITY) <=
      current.minutes
    ) {
      continue;
    }
    bestByState.set(stateKey, current.minutes);

    if (current.stationId === destinationStationId) {
      return { minutes: current.minutes, lines: current.lines };
    }

    for (const connection of connections) {
      const nextStationId =
        connection.stationAId === current.stationId
          ? connection.stationBId
          : connection.stationBId === current.stationId
            ? connection.stationAId
            : null;
      if (!nextStationId) {
        continue;
      }

      const isTrain = connection.transportMode === "train";
      const isSameLine = isTrain && current.currentLine === connection.lineName;
      const waitMinutes =
        isTrain && !isSameLine
          ? Math.ceil(connection.headwayMinutes / 2)
          : 0;
      const transferMinutes =
        isTrain && current.currentLine && !isSameLine
          ? connection.transferMinutes
          : 0;
      const nextLine = isTrain ? connection.lineName : null;
      const nextLines =
        isTrain && !current.lines.includes(connection.lineName)
          ? [...current.lines, connection.lineName]
          : current.lines;
      queue.push({
        stationId: nextStationId,
        currentLine: nextLine,
        minutes:
          current.minutes +
          connection.rideMinutes +
          waitMinutes +
          transferMinutes,
        lines: nextLines,
      });
    }
  }

  return null;
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

export function estimateStationWalkFallbacks(
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
  if (!match) return null;
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
