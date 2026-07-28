import type { Cinema } from "../../shared/types";

interface CinemaRow {
  id: string;
  name: string;
  short_name: string;
  area: Cinema["area"];
  area_label: string;
  address: string;
  latitude: number;
  longitude: number;
  street_view_latitude: number | null;
  street_view_longitude: number | null;
  street_view_heading: number | null;
  street_view_pitch: number;
  street_view_fov: number;
  source_url: string;
  active_until: string | null;
  approval: Cinema["approval"];
  nearest_station_id: string | null;
  station_walk_minutes: number | null;
  station_walk_distance_meters: number | null;
}

export async function listActiveCinemas(
  db: D1Database,
  date: string,
  publicOnly: boolean,
): Promise<Cinema[]> {
  const approvalClause = publicOnly
    ? "approval = 'approved'"
    : "approval != 'disabled'";
  const result = await db
    .prepare(
      `SELECT
        id, name, short_name, area, area_label, address, latitude, longitude,
         street_view_latitude, street_view_longitude, street_view_heading,
         street_view_pitch, street_view_fov, source_url, active_until, approval,
         nearest_station_id,
         station_walk_minutes, station_walk_distance_meters
      FROM cinemas
      WHERE ${approvalClause}
        AND (active_until IS NULL OR active_until >= ?)
      ORDER BY name`,
    )
    .bind(date)
    .all<CinemaRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    area: row.area,
    areaLabel: row.area_label,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    streetViewLatitude: row.street_view_latitude ?? row.latitude,
    streetViewLongitude: row.street_view_longitude ?? row.longitude,
    streetViewHeading: row.street_view_heading,
    streetViewPitch: row.street_view_pitch ?? 0,
    streetViewFov: row.street_view_fov ?? 95,
    sourceUrl: row.source_url,
    activeUntil: row.active_until,
    approval: row.approval,
    nearestStationId: row.nearest_station_id,
    stationWalkMinutes: row.station_walk_minutes,
    stationWalkDistanceMeters: row.station_walk_distance_meters,
  }));
}
