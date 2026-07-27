import { jstEndToIso, jstLocalToIso } from "../../../shared/date";
import { moviePreferenceKey } from "../../../shared/movie";
import type { NormalizedShowing } from "../../../shared/types";

interface TohoShow {
  code?: string | number;
  showingStart?: string;
  showingEnd?: string;
  unsoldSeatInfo?: {
    unsoldSeatStatus?: string | null;
  } | null;
}

interface TohoScreen {
  name?: string;
  iconNm1?: string;
  iconNm2?: string;
  iconNm3?: string;
  list?: TohoShow[];
}

interface TohoMovie {
  code?: string;
  name?: string;
  icon?: string;
  list?: TohoScreen[];
}

interface TohoTheater {
  list?: TohoMovie[];
}

interface TohoScheduleResponse {
  status?: string;
  data?: Array<{
    list?: TohoTheater[];
  }>;
}

export function parseTohoSchedule(
  input: unknown,
  date: string,
  sourceId: string,
  cinemaId: string,
  bookingUrl: string,
): NormalizedShowing[] {
  const response = input as TohoScheduleResponse;
  if (response.status !== "0" || !Array.isArray(response.data)) return [];

  const result: NormalizedShowing[] = [];
  for (const day of response.data) {
    for (const theater of day.list ?? []) {
      for (const movie of theater.list ?? []) {
        const title = normalizeJapanese(movie.name ?? "");
        if (!title) continue;
        for (const screen of movie.list ?? []) {
          const format = [
            movie.icon,
            screen.iconNm1,
            screen.iconNm2,
            screen.iconNm3,
          ]
            .map((value) => normalizeJapanese(value ?? ""))
            .filter(Boolean)
            .join(" / ");
          for (const show of screen.list ?? []) {
            const start = show.showingStart?.trim() ?? "";
            if (!show.code || !start) continue;
            const end = show.showingEnd?.trim() ?? "";
            const seatStatus =
              show.unsoldSeatInfo?.unsoldSeatStatus ?? null;
            result.push({
              sourceId,
              cinemaId,
              movieKey: movie.code ?? moviePreferenceKey(title),
              title,
              imageUrl: null,
              startsAt: jstLocalToIso(date, start),
              endsAt: end ? jstEndToIso(date, start, end) : null,
              screen: normalizeJapanese(screen.name ?? "") || null,
              format: format || null,
              bookingUrl,
              purchasable:
                seatStatus === null
                  ? null
                  : ["A", "B", "C"].includes(seatStatus),
            });
          }
        }
      }
    }
  }
  return result;
}

function normalizeJapanese(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
