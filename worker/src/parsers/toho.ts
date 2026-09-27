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
  code?: string;
  theaterCd?: string;
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
  code?: string;
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
            const seatStatus = show.unsoldSeatInfo?.unsoldSeatStatus ?? null;
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
              bookingUrl: tohoBookingUrl(
                bookingUrl,
                date,
                theater.code,
                movie.code,
                screen.theaterCd,
                screen.code,
                show.code,
                seatStatus !== null && ["A", "B", "C"].includes(seatStatus),
              ),
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

// These parameters are the official ScheduleUtils.purchaseTicket fields.
// The entry point accepts them in the URL and preserves them through guest login.
function tohoBookingUrl(
  fallbackUrl: string,
  date: string,
  site: string | undefined,
  movie: string | undefined,
  theater: string | undefined,
  screen: string | undefined,
  performance: string | number,
  purchasable: boolean,
): string {
  const fallback = new URL(fallbackUrl);
  fallback.searchParams.set("show_day", date.replaceAll("-", ""));
  if (
    !purchasable ||
    ![site, movie, theater, screen, String(performance)].every(
      (value) => value !== undefined && /^\d{1,10}$/.test(value),
    )
  )
    return fallback.toString();
  const url = new URL(`/net/ticket/${site}/TNPI2040J03.do`, fallbackUrl);
  url.search = new URLSearchParams({
    site_cd: site!,
    jyoei_date: date.replaceAll("-", ""),
    gekijyo_cd: theater!,
    screen_cd: screen!,
    sakuhin_cd: movie!,
    pf_no: String(performance),
    fnc: "1",
    pageid: "2000J01",
    enter_kbn: "",
  }).toString();
  return url.toString();
}
