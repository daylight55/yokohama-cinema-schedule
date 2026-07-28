const MAX_SEARCH_QUERY_LENGTH = 80;
const SEARCH_TERM_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[a-z0-9]+/giu;

export function normalizeSearchQuery(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function searchTerms(value: string): string[] {
  return (
    normalizeSearchQuery(value)
      .toLocaleLowerCase("ja")
      .match(SEARCH_TERM_PATTERN) ?? []
  );
}

export function showingSearchText(
  title: string,
  cinemaName: string,
  cinemaShortName = "",
): string {
  return searchTerms(`${title} ${cinemaName} ${cinemaShortName}`).join(" ");
}

export function matchesShowingSearchQuery(
  query: string,
  title: string,
  cinemaName: string,
  cinemaShortName = "",
): boolean {
  const queryTerms = [...new Set(searchTerms(query))];
  if (queryTerms.length === 0) return true;
  const showingTerms = new Set(
    searchTerms(`${title} ${cinemaName} ${cinemaShortName}`),
  );
  return queryTerms.every((term) => showingTerms.has(term));
}

export function searchMatchExpression(value: string): string | null {
  const terms = [...new Set(searchTerms(value))];
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
}
