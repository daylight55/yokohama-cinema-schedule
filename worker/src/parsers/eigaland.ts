import { resolveBookingUrl } from "./booking";
import type { NormalizedShowing } from "../../../shared/types";
import { safeImageUrl } from "../../../shared/movie";

interface EigalandShow {
  showId?: string;
  startTime?: string;
  endTime?: string;
  ticketingUrl?: string;
  purchasable?: boolean;
  screeningFormat?: string | null;
  /** Eigaland's per-showing language/version label (for example 字幕 or 吹替). */
  version2?: string | null;
  /** Additional per-showing label(s), when present. */
  version3?: string | string[] | null;
}

interface EigalandHouse {
  houseName?: string;
  showList?: EigalandShow[];
}

interface EigalandMovie {
  movieDetail?: {
    movieId?: string;
    movieName?: string;
    posterUrl?: string;
  };
  houseList?: EigalandHouse[];
}

export function parseEigalandSchedule(
  input: unknown,
  sourceId: string,
  cinemaId: string,
  fallbackBookingUrl: string,
): NormalizedShowing[] {
  if (!Array.isArray(input)) throw new Error("Eigaland schedule response is invalid");
  const result: NormalizedShowing[] = [];

  for (const entry of input as EigalandMovie[]) {
    const movie = entry.movieDetail;
    if (!movie?.movieName) continue;
    for (const house of entry.houseList ?? []) {
      for (const show of house.showList ?? []) {
        if (!show.startTime) continue;
        result.push({
          sourceId,
          cinemaId,
          movieKey: movie.movieId ?? movie.movieName,
          title: normalizeJapanese(movie.movieName),
          imageUrl: safeImageUrl(movie.posterUrl),
          startsAt: new Date(show.startTime).toISOString(),
          endsAt: show.endTime ? new Date(show.endTime).toISOString() : null,
          screen: house.houseName ? normalizeJapanese(house.houseName) : null,
          format: eigalandFormat(show, movie.movieName),
          bookingUrl:
            resolveBookingUrl(show.ticketingUrl, fallbackBookingUrl) ??
            fallbackBookingUrl,
          purchasable: show.purchasable ?? null,
        });
      }
    }
  }

  return result;
}

function eigalandFormat(show: EigalandShow, title: string): string | null {
  const versionLabels = [
    show.screeningFormat,
    show.version2,
    ...(Array.isArray(show.version3) ? show.version3 : [show.version3]),
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.normalize("NFKC").trim())
    .filter((value) => value && !/^(?:なし|なし\s*\(|none|n\/a)$/i.test(value));
  const labels = versionLabels.length ? versionLabels : [detectFormat(title)].filter((value): value is string => Boolean(value));
  return [...new Set(labels)].join(" / ") || null;
}

function normalizeJapanese(value: string): string {
  return value.normalize("NFC");
}

function detectFormat(title: string): string | null {
  const match = title.match(/(?:字幕|吹替|4K|3D|2D)/g);
  return match ? [...new Set(match)].join(" / ") : null;
}
