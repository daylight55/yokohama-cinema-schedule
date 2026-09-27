import reviewed from "../data/movie-title-corrections/2026-09-27.json";
import { movieDisplayTitle } from "./movie";

/** Use reviewed source identity, never a fuzzy prefix match between film names. */
export function collectedMovieTitle(
  title: string,
  sourceId: string,
  sourceMovieId: string,
): string {
  const clean = movieDisplayTitle(title) || title.trim();
  const correction = reviewed.corrections.find(
    (row) => row.sourceIds.includes(sourceId) &&
      row.sourceMovieId === sourceMovieId &&
      row.observedTitles.includes(clean),
  );
  return correction?.canonicalTitle ?? clean;
}

/** Keep previously shared movie URLs usable after a reviewed identity repair. */
export function canonicalMovieKey(key: string): string {
  const aliases: Readonly<Record<string, string>> = reviewed.legacyMovieKeys;
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}
