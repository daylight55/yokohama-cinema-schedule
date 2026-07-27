import type { Cinema, StationConnection } from "../../shared/types";
import { SAME_CINEMA_TRANSFER_MINUTES } from "../../shared/planner";
import { estimateStationTravel } from "./stations";

export const CINEMA_TRANSFER_BUFFER_MINUTES = 5;
const WALKING_METERS_PER_MINUTE = 70;
const WALKING_DISTANCE_FACTOR = 1.25;

function pairKey(fromCinemaId: string, toCinemaId: string): string {
  return `${fromCinemaId}:${toCinemaId}`;
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
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function directWalkingMinutes(from: Cinema, to: Cinema): number {
  const distanceMeters =
    haversineMeters(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude,
    ) * WALKING_DISTANCE_FACTOR;
  return (
    Math.max(1, Math.ceil(distanceMeters / WALKING_METERS_PER_MINUTE)) +
    CINEMA_TRANSFER_BUFFER_MINUTES
  );
}

export function buildCinemaTransferMinutes(
  cinemas: Cinema[],
  connections: StationConnection[],
): Map<string, number> {
  const transfers = new Map<string, number>();

  for (const from of cinemas) {
    for (const to of cinemas) {
      if (from.id === to.id) {
        transfers.set(
          pairKey(from.id, to.id),
          SAME_CINEMA_TRANSFER_MINUTES,
        );
        continue;
      }

      const walkMinutes = directWalkingMinutes(from, to);
      const stationTravel =
        from.nearestStationId && to.nearestStationId
          ? estimateStationTravel(
              from.nearestStationId,
              to.nearestStationId,
              connections,
            )
          : null;
      const stationMinutes =
        stationTravel &&
        from.stationWalkMinutes !== null &&
        from.stationWalkMinutes !== undefined &&
        to.stationWalkMinutes !== null &&
        to.stationWalkMinutes !== undefined
          ? from.stationWalkMinutes +
            stationTravel.minutes +
            to.stationWalkMinutes +
            CINEMA_TRANSFER_BUFFER_MINUTES
          : Number.POSITIVE_INFINITY;

      transfers.set(
        pairKey(from.id, to.id),
        Math.min(walkMinutes, stationMinutes),
      );
    }
  }

  return transfers;
}
