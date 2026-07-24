import type { NormalizedShowing } from "../../../shared/types";
import { safeImageUrl } from "../../../shared/movie";

interface EigalandShow {
  showId?: string;
  startTime?: string;
  endTime?: string;
  ticketingUrl?: string;
  purchasable?: boolean;
  screeningFormat?: string | null;
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
  if (!Array.isArray(input)) return [];
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
          format: show.screeningFormat ?? detectFormat(movie.movieName),
          bookingUrl: show.ticketingUrl || fallbackBookingUrl,
          purchasable: show.purchasable ?? null,
        });
      }
    }
  }

  return result;
}

function normalizeJapanese(value: string): string {
  return value.normalize("NFC");
}

function detectFormat(title: string): string | null {
  const match = title.match(/(?:字幕|吹替|4K|3D|2D)/g);
  return match ? [...new Set(match)].join(" / ") : null;
}
