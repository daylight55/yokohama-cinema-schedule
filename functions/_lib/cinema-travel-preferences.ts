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
  custom_duration_minutes: number | null;
  show_in_schedule: number;
  note: string;
  updated_at: string;
}

export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === "string" && TRAVEL_MODES.has(value as TravelMode);
}

export function isCustomDurationMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 1440
  );
}

export function normalizeCinemaNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.trim();
  return note.length <= 2000 ? note : null;
}

export async function listCinemaTravelPreferences(
  db: D1Database,
  cinemas: Pick<Cinema, "id">[],
  userId = "legacy-local",
): Promise<CinemaTravelPreference[]> {
  if (cinemas.length === 0) return [];

  const result = await db
    .prepare(
      `SELECT cinema_id, travel_mode, custom_duration_minutes,
              show_in_schedule, note, updated_at
       FROM cinema_travel_preferences
       WHERE user_id = ?
         AND cinema_id IN (${cinemas.map(() => "?").join(", ")})`,
    )
    .bind(userId, ...cinemas.map((cinema) => cinema.id))
    .all<CinemaTravelPreferenceRow>();
  const savedByCinema = new Map(
    (result.results ?? []).map((row) => [row.cinema_id, row]),
  );

  return cinemas.map((cinema) => {
    const saved = savedByCinema.get(cinema.id);
    return {
      cinemaId: cinema.id,
      travelMode: saved?.travel_mode ?? DEFAULT_TRAVEL_MODE,
      customDurationMinutes: saved?.custom_duration_minutes ?? null,
      showInSchedule: saved ? Boolean(saved.show_in_schedule) : true,
      note: saved?.note ?? "",
      updatedAt: saved?.updated_at ?? null,
    };
  });
}
