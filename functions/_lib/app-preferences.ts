import type { LocationPreference } from "../../shared/types";

export const LOCATION_AUTO_ENABLED_KEY = "location_auto_enabled";

interface AppPreferenceRow {
  preference_value: string;
  updated_at: string;
}

export function parseStoredBoolean(value: string | null): boolean {
  return value === "true";
}

export async function getLocationPreference(
  db: D1Database,
): Promise<LocationPreference> {
  const row = await db
    .prepare(
      `SELECT preference_value, updated_at
       FROM app_preferences
       WHERE preference_key = ?`,
    )
    .bind(LOCATION_AUTO_ENABLED_KEY)
    .first<AppPreferenceRow>();

  return {
    autoEnabled: parseStoredBoolean(row?.preference_value ?? null),
    updatedAt: row?.updated_at ?? null,
  };
}

export async function setLocationPreference(
  db: D1Database,
  autoEnabled: boolean,
): Promise<LocationPreference> {
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO app_preferences
        (preference_key, preference_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(preference_key) DO UPDATE SET
         preference_value = excluded.preference_value,
         updated_at = excluded.updated_at`,
    )
    .bind(LOCATION_AUTO_ENABLED_KEY, String(autoEnabled), updatedAt)
    .run();

  return { autoEnabled, updatedAt };
}
