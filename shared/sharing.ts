import { moviePreferenceKey } from "./movie";

export interface SharedMember {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string;
}
export interface SharedPlan {
  userId: string;
  showingId: string;
  title: string;
  cinemaName: string;
  startsAt: string;
  endsAt: string | null;
  reserved: boolean;
}
export interface SharedMovie {
  status?: "watched" | null;
  comment?: string;
  nextShowingAt?: string;
  userId: string;
  movieKey: string;
  title: string;
  imageUrl: string | null;
}
export interface SharingResponse {
  userId: string;
  groups: { id: string; name: string; preferred?: number }[];
  groupId: string | null;
  members: SharedMember[];
  plans: SharedPlan[];
  movies: SharedMovie[];
  titles: { japaneseTitle: string; englishTitle: string | null }[];
}

/** Older saved watchlists can contain keys from a previous normalization rule. */
export function groupSharedMovies(movies: SharedMovie[], member = "") {
  const groups = new Map<string, SharedMovie[]>();
  for (const movie of movies) {
    if (member && movie.userId !== member) continue;
    const key = moviePreferenceKey(movie.title);
    const rows = groups.get(key) ?? [];
    if (!rows.some((row) => row.userId === movie.userId)) rows.push(movie);
    groups.set(key, rows);
  }
  return groups;
}

/** Prioritize mutual, unwatched interest; keep fully watched films out of planning. */
export function sharedWatchlistSections(movies: SharedMovie[], member = "") {
  const entries = [...groupSharedMovies(movies, member)];
  const interestCount = (rows: SharedMovie[]) =>
    rows.filter((row) => row.status !== "watched").length;
  entries.sort(
    (a, b) =>
      interestCount(b[1]) - interestCount(a[1]) ||
      (a[1][0].nextShowingAt ?? "").localeCompare(
        b[1][0].nextShowingAt ?? "",
      ) ||
      a[0].localeCompare(b[0]),
  );
  return {
    planning: entries.filter(([, rows]) => interestCount(rows) > 0 && rows.some(row => row.nextShowingAt)),
    unscheduled: entries.filter(([, rows]) => interestCount(rows) > 0 && !rows.some(row => row.nextShowingAt)),
    watched: entries.filter(([, rows]) => interestCount(rows) === 0),
  };
}
