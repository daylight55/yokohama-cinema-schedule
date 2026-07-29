import { addDays } from "../../shared/date";
import { moviePreferenceKey } from "../../shared/movie";

const TMDB_API_ORIGIN = "https://api.themoviedb.org";
const MAX_DISCOVER_PAGES = 10;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface TmdbMovie {
  id: number;
  title: string;
  originalTitle: string;
  releaseDate: string;
}

interface TmdbDiscoverPage {
  page: number;
  totalPages: number;
  movies: TmdbMovie[];
}

export interface TmdbReleaseDateRecord {
  titleKey: string;
  tmdbMovieId: number;
  tmdbTitle: string;
  releaseDate: string;
}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function tmdbDiscoverUrl(
  page: number,
  today: string,
): string {
  const url = new URL("/3/discover/movie", TMDB_API_ORIGIN);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("include_video", "false");
  url.searchParams.set("language", "ja-JP");
  url.searchParams.set("region", "JP");
  // Keep the capped result set biased toward currently showing and upcoming
  // titles instead of consuming every page on older releases first.
  url.searchParams.set("sort_by", "primary_release_date.desc");
  url.searchParams.set("with_release_type", "2|3");
  url.searchParams.set("release_date.gte", addDays(today, -120));
  url.searchParams.set("release_date.lte", addDays(today, 14));
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function parseTmdbDiscoverPage(
  value: unknown,
): TmdbDiscoverPage {
  if (!isRecord(value)) {
    throw new Error("TMDB response must be an object");
  }
  const page = numberValue(value.page);
  const totalPages = numberValue(value.total_pages);
  if (
    page === null ||
    totalPages === null ||
    !Array.isArray(value.results)
  ) {
    throw new Error("TMDB response is missing pagination data");
  }

  const movies = value.results.flatMap((candidate): TmdbMovie[] => {
    if (!isRecord(candidate)) return [];
    const id = numberValue(candidate.id);
    const title = stringValue(candidate.title);
    const originalTitle = stringValue(candidate.original_title);
    const releaseDate = stringValue(candidate.release_date);
    if (
      id === null ||
      !title ||
      !originalTitle ||
      !releaseDate ||
      !isIsoDate(releaseDate)
    ) {
      return [];
    }
    return [{ id, title, originalTitle, releaseDate }];
  });

  return { page, totalPages, movies };
}

export function tmdbReleaseDateRecords(
  movies: TmdbMovie[],
): TmdbReleaseDateRecord[] {
  const records = new Map<string, TmdbReleaseDateRecord>();
  for (const movie of movies) {
    for (const title of new Set([movie.title, movie.originalTitle])) {
      const titleKey = moviePreferenceKey(title);
      if (!titleKey) continue;
      const current = records.get(titleKey);
      if (current && current.releaseDate <= movie.releaseDate) continue;
      records.set(titleKey, {
        titleKey,
        tmdbMovieId: movie.id,
        tmdbTitle: movie.title,
        releaseDate: movie.releaseDate,
      });
    }
  }
  return [...records.values()];
}

export async function fetchTmdbReleaseDates(
  accessToken: string,
  today: string,
  fetcher: Fetcher = fetch,
): Promise<TmdbReleaseDateRecord[]> {
  const firstPage = await fetchTmdbPage(
    accessToken,
    tmdbDiscoverUrl(1, today),
    fetcher,
  );
  const pageCount = Math.min(
    Math.max(firstPage.totalPages, 1),
    MAX_DISCOVER_PAGES,
  );
  const pages = [firstPage];
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(
      await fetchTmdbPage(
        accessToken,
        tmdbDiscoverUrl(page, today),
        fetcher,
      ),
    );
  }
  return tmdbReleaseDateRecords(pages.flatMap((page) => page.movies));
}

async function fetchTmdbPage(
  accessToken: string,
  url: string,
  fetcher: Fetcher,
): Promise<TmdbDiscoverPage> {
  const response = await fetcher(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`api.themoviedb.org: HTTP ${response.status}`);
  }
  return parseTmdbDiscoverPage(await response.json());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  try {
    return addDays(value, 0) === value;
  } catch {
    return false;
  }
}
