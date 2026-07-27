import type {
  RouteOrigin,
  ScheduleCollapseMinutes,
  UserProfile,
} from "../../shared/types";
import type { StationWalkEstimate } from "./stations";

interface UserProfileRow {
  home_latitude: number;
  home_longitude: number;
  home_updated_at: string;
}

interface HomeStationAccessRow {
  station_id: string;
  walk_minutes: number;
  distance_meters: number;
  provider: StationWalkEstimate["provider"];
}

interface DisplayPreferenceRow {
  preference_value: string;
}

export const DEFAULT_SCHEDULE_COLLAPSE_MINUTES = 60;

export function isScheduleCollapseMinutes(
  value: unknown,
): value is ScheduleCollapseMinutes {
  return value === 0 || value === 30 || value === 60;
}

export interface HomeLocation extends RouteOrigin {
  updatedAt: string;
}

export function normalizeHomeCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown,
): RouteOrigin | null {
  if (
    typeof latitudeValue !== "number" ||
    typeof longitudeValue !== "number"
  ) {
    return null;
  }
  const latitude = latitudeValue;
  const longitude = longitudeValue;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  // Minute-level travel estimates do not need household-level GPS precision.
  return {
    latitude: Math.round(latitude * 10_000) / 10_000,
    longitude: Math.round(longitude * 10_000) / 10_000,
  };
}

export async function getHomeLocation(
  db: D1Database,
  userId = "legacy-local",
): Promise<HomeLocation | null> {
  const row = await db
    .prepare(
      `SELECT home_latitude, home_longitude, home_updated_at
       FROM user_profiles
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<UserProfileRow>();
  if (!row) return null;

  return {
    latitude: row.home_latitude,
    longitude: row.home_longitude,
    updatedAt: row.home_updated_at,
  };
}

export async function getUserProfile(
  db: D1Database,
  userId = "legacy-local",
): Promise<UserProfile> {
  const [home, scheduleCollapseMinutes] = await Promise.all([
    getHomeLocation(db, userId),
    getScheduleCollapseMinutes(db, userId),
  ]);
  return {
    homeRegistered: Boolean(home),
    homeUpdatedAt: home?.updatedAt ?? null,
    scheduleCollapseMinutes,
  };
}

export async function getScheduleCollapseMinutes(
  db: D1Database,
  userId = "legacy-local",
): Promise<ScheduleCollapseMinutes> {
  const row = await db
    .prepare(
      `SELECT preference_value
       FROM app_preferences
       WHERE user_id = ?
         AND preference_key = 'schedule_collapse_minutes'`,
    )
    .bind(userId)
    .first<DisplayPreferenceRow>();
  const value = row ? Number(row.preference_value) : null;
  return isScheduleCollapseMinutes(value)
    ? value
    : DEFAULT_SCHEDULE_COLLAPSE_MINUTES;
}

export async function saveScheduleCollapseMinutes(
  db: D1Database,
  value: ScheduleCollapseMinutes,
  userId = "legacy-local",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_preferences (
         user_id,
         preference_key,
         preference_value,
         updated_at
       )
       VALUES (?, 'schedule_collapse_minutes', ?, ?)
       ON CONFLICT(user_id, preference_key) DO UPDATE SET
         preference_value = excluded.preference_value,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, String(value), new Date().toISOString())
    .run();
}

export async function saveHomeLocation(
  db: D1Database,
  home: RouteOrigin,
  stationWalks: StationWalkEstimate[],
  userId = "legacy-local",
): Promise<UserProfile> {
  const updatedAt = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_profiles
          (user_id, home_latitude, home_longitude, home_updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           home_latitude = excluded.home_latitude,
           home_longitude = excluded.home_longitude,
           home_updated_at = excluded.home_updated_at`,
      )
      .bind(userId, home.latitude, home.longitude, updatedAt),
    db
      .prepare("DELETE FROM user_home_station_access WHERE user_id = ?")
      .bind(userId),
    ...stationWalks.map((walk) =>
      db
        .prepare(
          `INSERT INTO user_home_station_access (
             user_id, station_id, walk_minutes, distance_meters, provider,
             calculated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          walk.station.id,
          walk.durationMinutes,
          walk.distanceMeters,
          walk.provider,
          updatedAt,
        ),
    ),
  ]);

  return getUserProfile(db, userId);
}

export async function listHomeStationAccess(
  db: D1Database,
  stationsById: Map<string, StationWalkEstimate["station"]>,
  userId = "legacy-local",
): Promise<StationWalkEstimate[]> {
  const result = await db
    .prepare(
      `SELECT station_id, walk_minutes, distance_meters, provider
       FROM user_home_station_access
       WHERE user_id = ?`,
    )
    .bind(userId)
    .all<HomeStationAccessRow>();

  return (result.results ?? []).flatMap((row) => {
    const station = stationsById.get(row.station_id);
    return station
      ? [
          {
            station,
            durationMinutes: row.walk_minutes,
            distanceMeters: row.distance_meters,
            provider: row.provider,
          },
        ]
      : [];
  });
}

export async function deleteHomeLocation(
  db: D1Database,
  userId = "legacy-local",
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM user_home_station_access WHERE user_id = ?")
      .bind(userId),
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(userId),
  ]);
}
