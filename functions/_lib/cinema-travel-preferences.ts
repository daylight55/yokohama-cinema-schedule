import type {
  Cinema,
  CinemaTravelPreference,
  TravelMode,
} from "../../shared/types";

export const DEFAULT_TRAVEL_MODE: TravelMode = "transit";

const TRAVEL_MODES = new Set<TravelMode>([
  "walking",
  "transit",
  "bus",
  "bicycle",
]);

interface CinemaTravelPreferenceRow {
  cinema_id: string;
  travel_mode: TravelMode;
  updated_at: string;
}
export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === "string" && TRAVEL_MODES.has(value as TravelMode);
}

export async function listCinemaTravelPreferences(
  db: D1Database,
  cinemas: Pick<Cinema, "id">[],
): Promise<CinemaTravelPreference[]> {
  if (cinemas.length === 0) return [];

  const result = await db
    .prepare(
      `SELECT cinema_id, travel_mode, updated_at
       FROM cinema_travel_preferences
       WHERE cinema_id IN (${cinemas.map(() => "?").join(", ")})`,
    )
    .bind(...cinemas.map((cinema) => cinema.id))
    .all<CinemaTravelPreferenceRow>();
  const savedByCinema = new Map(
    (result.results ?? []).map((row) => [row.cinema_id, row]),
  );

  return cinemas.map((cinema) => {
    const saved = savedByCinema.get(cinema.id);
    return {
      cinemaId: cinema.id,
      travelMode: saved?.travel_mode ?? DEFAULT_TRAVEL_MODE,
      updatedAt: saved?.updated_at ?? null,
    };
  });
}
