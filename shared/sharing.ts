import { moviePreferenceKey } from "./movie";

export interface SharedMember {
  userId: string;
  name: string;
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
  userId: string;
  movieKey: string;
  title: string;
  imageUrl: string | null;
}
export interface SharingResponse {
  userId: string;
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
