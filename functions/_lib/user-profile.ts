import type {
  RouteOrigin,
  ScheduleCollapseMinutes,
  UserProfile,
} from "../../shared/types";
import {
  DEPARTURE_ENCRYPTION_VERSION,
  decryptDepartureLocation,
  encryptDepartureLocation,
  type EncryptedDepartureLocation,
} from "./profile-crypto";
import type { StationWalkEstimate } from "./stations";

interface UserProfileRow {
  home_latitude: number;
  home_longitude: number;
  home_updated_at: string;
  departure_ciphertext: string | null;
  departure_iv: string | null;
  departure_salt: string | null;
  departure_encryption_version: number | null;
}

interface DepartureStationAccessRow {
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

export interface DepartureLocation extends RouteOrigin {
  updatedAt: string;
}

export function normalizeDepartureCoordinates(
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

function encryptedLocationFromRow(
  row: UserProfileRow,
): EncryptedDepartureLocation | null {
  const encryptedValues = [
    row.departure_ciphertext,
    row.departure_iv,
    row.departure_salt,
    row.departure_encryption_version,
  ];
  if (encryptedValues.every((value) => value === null)) return null;
  if (
    typeof row.departure_ciphertext !== "string" ||
    typeof row.departure_iv !== "string" ||
    typeof row.departure_salt !== "string" ||
    row.departure_encryption_version !== DEPARTURE_ENCRYPTION_VERSION
  ) {
    throw new Error("invalid_encrypted_departure_location");
  }
  return {
    ciphertext: row.departure_ciphertext,
    iv: row.departure_iv,
    salt: row.departure_salt,
    version: row.departure_encryption_version,
  };
}

async function persistEncryptedDepartureLocation(
  db: D1Database,
  userId: string,
  encrypted: EncryptedDepartureLocation,
): Promise<void> {
  await db
    .prepare(
      `UPDATE user_profiles
       SET home_latitude = 0,
           home_longitude = 0,
           departure_ciphertext = ?,
           departure_iv = ?,
           departure_salt = ?,
           departure_encryption_version = ?
       WHERE user_id = ?`,
    )
    .bind(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.salt,
      encrypted.version,
      userId,
    )
    .run();
}

export async function getDepartureLocation(
  db: D1Database,
  masterKey: string,
  userId = "legacy-local",
): Promise<DepartureLocation | null> {
  const row = await db
    .prepare(
      `SELECT home_latitude, home_longitude, home_updated_at,
              departure_ciphertext, departure_iv, departure_salt,
              departure_encryption_version
       FROM user_profiles
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<UserProfileRow>();
  if (!row) return null;

  const encrypted = encryptedLocationFromRow(row);
  if (encrypted) {
    return {
      ...(await decryptDepartureLocation(masterKey, userId, encrypted)),
      updatedAt: row.home_updated_at,
    };
  }

  const legacyLocation = normalizeDepartureCoordinates(
    row.home_latitude,
    row.home_longitude,
  );
  if (!legacyLocation) throw new Error("invalid_legacy_departure_location");
  const migrated = await encryptDepartureLocation(
    masterKey,
    userId,
    legacyLocation,
  );
  await persistEncryptedDepartureLocation(db, userId, migrated);
  return {
    ...legacyLocation,
    updatedAt: row.home_updated_at,
  };
}

export async function getUserProfile(
  db: D1Database,
  masterKey: string,
  userId = "legacy-local",
): Promise<UserProfile> {
  const [departure, scheduleCollapseMinutes] = await Promise.all([
    getDepartureLocation(db, masterKey, userId),
    getScheduleCollapseMinutes(db, userId),
  ]);
  return {
    departureRegistered: Boolean(departure),
    departureUpdatedAt: departure?.updatedAt ?? null,
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

export async function saveDepartureLocation(
  db: D1Database,
  masterKey: string,
  departure: RouteOrigin,
  stationWalks: StationWalkEstimate[],
  userId = "legacy-local",
): Promise<UserProfile> {
  const updatedAt = new Date().toISOString();
  const encrypted = await encryptDepartureLocation(
    masterKey,
    userId,
    departure,
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_profiles
          (
            user_id, home_latitude, home_longitude, home_updated_at,
            departure_ciphertext, departure_iv, departure_salt,
            departure_encryption_version
          )
         VALUES (?, 0, 0, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           home_latitude = 0,
           home_longitude = 0,
           home_updated_at = excluded.home_updated_at,
           departure_ciphertext = excluded.departure_ciphertext,
           departure_iv = excluded.departure_iv,
           departure_salt = excluded.departure_salt,
           departure_encryption_version =
             excluded.departure_encryption_version`,
      )
      .bind(
        userId,
        updatedAt,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.salt,
        encrypted.version,
      ),
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

  return getUserProfile(db, masterKey, userId);
}

export async function listDepartureStationAccess(
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
    .all<DepartureStationAccessRow>();

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

export async function prepareDepartureLocationTransfer(
  db: D1Database,
  masterKey: string,
  fromUserId: string,
  toUserId: string,
): Promise<D1PreparedStatement> {
  const departure = await getDepartureLocation(db, masterKey, fromUserId);
  if (!departure) {
    return db
      .prepare("UPDATE user_profiles SET user_id = ? WHERE user_id = ?")
      .bind(toUserId, fromUserId);
  }
  const encrypted = await encryptDepartureLocation(
    masterKey,
    toUserId,
    departure,
  );
  return db
    .prepare(
      `UPDATE user_profiles
       SET user_id = ?,
           home_latitude = 0,
           home_longitude = 0,
           departure_ciphertext = ?,
           departure_iv = ?,
           departure_salt = ?,
           departure_encryption_version = ?
       WHERE user_id = ?`,
    )
    .bind(
      toUserId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.salt,
      encrypted.version,
      fromUserId,
    );
}

export async function deleteDepartureLocation(
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
