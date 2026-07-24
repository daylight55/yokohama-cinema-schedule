import type { Station, StationConnection } from "../../shared/types";

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
