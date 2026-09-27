/** Structured film credits from Wikidata; no generated names or production dates. */
export interface CreditPerson {
  id: string;
  ja: string | null;
  en: string | null;
}
export interface MovieCredits {
  entityId: string;
  releaseYear: number | null;
  directors: CreditPerson[];
  cast: CreditPerson[];
  sourceUrl: string;
}
export interface CreditLookup {
  japaneseTitle: string;
  englishTitle: string | null;
  sourceUrl: string | null;
  entityId?: string | null;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const string = (value: unknown): string =>
  typeof value === "string" ? value : "";
const idPattern = /^Q[1-9]\d*$/;
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}]/gu, "");
const claimValue = (claim: unknown) =>
  object(object(object(claim).mainsnak).datavalue).value;
const claims = (entity: unknown, property: string) =>
  array(object(object(entity).claims)[property]).filter(
    (claim) => object(claim).rank !== "deprecated",
  );
const valueId = (claim: unknown) => string(object(claimValue(claim)).id);
const label = (entity: unknown, language: string) =>
  string(object(object(object(entity).labels)[language]).value);
const filmClasses = new Set([
  "Q11424",
  "Q24869",
  "Q202866",
  "Q506240",
  "Q24862",
]);

/** Reviewed Wikipedia sources resolve by exact sitelink, not fuzzy title search. */
export function creditSourceIdentity(
  input: CreditLookup,
): { id: string } | { site: string; title: string } | null {
  if (input.entityId && idPattern.test(input.entityId))
    return { id: input.entityId };
  try {
    const url = new URL(input.sourceUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (
      url.hostname === "www.wikidata.org" &&
      /^\/wiki\/Q[1-9]\d*$/.test(url.pathname)
    )
      return { id: url.pathname.slice(6) };
    if (
      ["ja.wikipedia.org", "en.wikipedia.org"].includes(url.hostname) &&
      url.pathname.startsWith("/wiki/")
    ) {
      return {
        site: url.hostname.startsWith("ja.") ? "jawiki" : "enwiki",
        title: decodeURIComponent(url.pathname.slice(6)).replaceAll("_", " "),
      };
    }
  } catch {
    /* An unsupported source is never fetched directly. */
  }
  return null;
}

/** Search results require both reviewed titles; ambiguous matches are rejected. */
export function matchesCreditFilm(
  entity: unknown,
  input: CreditLookup,
  identity = creditSourceIdentity(input),
): boolean {
  const row = object(entity);
  if (
    !idPattern.test(string(row.id)) ||
    !claims(entity, "P31").some((claim) => filmClasses.has(valueId(claim)))
  )
    return false;
  if (identity && "id" in identity) return row.id === identity.id;
  if (identity && "site" in identity)
    return (
      string(object(object(row.sitelinks)[identity.site]).title).replaceAll(
        "_",
        " ",
      ) === identity.title
    );
  const names = (language: string) => [
    label(entity, language),
    ...array(object(row.aliases)[language]).map((alias) =>
      string(object(alias).value),
    ),
  ];
  // Screening subtitles must not silently identify another film, TV series, or remake.
  return (
    !!input.englishTitle &&
    names("ja").some(
      (name) => normalized(name) === normalized(input.japaneseTitle),
    ) &&
    names("en").some(
      (name) => normalized(name) === normalized(input.englishTitle!),
    )
  );
}

export function creditPersonIds(
  entity: unknown,
  property: "P57" | "P161" | "P725",
): string[] {
  const ordinal = (claim: unknown) => {
    const value = Number(
      object(object(array(object(object(claim).qualifiers).P1545)[0]).datavalue)
        .value,
    );
    return Number.isFinite(value) && value > 0
      ? value
      : Number.MAX_SAFE_INTEGER;
  };
  return [
    ...new Set(
      claims(entity, property)
        .slice()
        .sort((a, b) => ordinal(a) - ordinal(b))
        .map(valueId)
        .filter((id) => idPattern.test(id)),
    ),
  ].slice(0, 6);
}

export function extractMovieCredits(
  entity: unknown,
  people: Record<string, unknown>,
): MovieCredits | null {
  const entityId = string(object(entity).id);
  if (!idPattern.test(entityId)) return null;
  const years = claims(entity, "P577")
    .map((claim) => object(claimValue(claim)))
    .filter(
      (value) =>
        Number(value.precision) >= 9 &&
        /^\+\d{4}-/.test(string(value.time)) &&
        value.calendarmodel === "http://www.wikidata.org/entity/Q1985727",
    )
    .map((value) => Number(string(value.time).slice(1, 5)))
    .filter((year) => year >= 1870 && year <= new Date().getUTCFullYear() + 10);
  const names = (property: "P57" | "P161" | "P725") =>
    creditPersonIds(entity, property).flatMap((id) => {
      const ja = label(people[id], "ja").trim().slice(0, 120) || null;
      const en =
        (label(people[id], "en") || label(people[id], "mul"))
          .trim()
          .slice(0, 120) || null;
      return ja || en ? [{ id, ja, en }] : [];
    });
  const result = {
    entityId,
    releaseYear: years.length ? Math.min(...years) : null,
    directors: names("P57"),
    cast: creditPersonIds(entity, "P161").length
      ? names("P161")
      : names("P725"),
    sourceUrl: `https://www.wikidata.org/wiki/${entityId}`,
  };
  return result.releaseYear || result.directors.length || result.cast.length
    ? result
    : null;
}

export const MAX_CREDIT_REQUESTS = 5;
export function creditFailureReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  return [
    "credits_budget_exhausted",
    "credits_access_blocked",
    "credits_fetch_failed",
    "credits_empty_response",
    "credits_response_too_large",
    "credits_api_error",
  ].includes(reason)
    ? reason
    : "credits_fetch_failed";
}
/** At most three normal requests (resolve/search, film, people); never follows source URLs. */
export async function researchMovieCredits(
  input: CreditLookup,
  request: typeof fetch = fetch,
): Promise<MovieCredits | null> {
  let requests = 0;
  async function api(params: Record<string, string>): Promise<ObjectValue> {
    if (++requests > MAX_CREDIT_REQUESTS)
      throw new Error("credits_budget_exhausted");
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      ...params,
      format: "json",
      maxlag: "5",
    }).toString();
    const response = await request(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      headers: {
        "user-agent": "HamaMovie/1.0 (film credits; hama-movie.daylight55.dev)",
        accept: "application/json",
      },
    });
    if (!response.ok)
      throw new Error(
        [403, 429].includes(response.status)
          ? "credits_access_blocked"
          : "credits_fetch_failed",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("credits_empty_response");
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2_000_000) throw new Error("credits_response_too_large");
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const result = object(JSON.parse(text));
    if (result.error) throw new Error("credits_api_error");
    return result;
  }
  const identity = creditSourceIdentity(input);
  let selector: Record<string, string>;
  if (identity && "id" in identity) selector = { ids: identity.id };
  else if (identity && "site" in identity)
    selector = { sites: identity.site, titles: identity.title };
  else {
    if (!input.englishTitle) return null;
    const search = await api({
      action: "wbsearchentities",
      search: input.englishTitle,
      language: "en",
      type: "item",
      limit: "5",
    });
    const ids = array(search.search)
      .map((row) => string(object(row).id))
      .filter((id) => idPattern.test(id))
      .slice(0, 5);
    if (!ids.length) return null;
    selector = { ids: ids.join("|") };
  }
  const response = await api({
    action: "wbgetentities",
    ...selector,
    props: "claims|labels|aliases|sitelinks",
    languages: "ja|en",
  });
  const candidates = Object.values(object(response.entities)).filter((entity) =>
    matchesCreditFilm(entity, input, identity),
  );
  if (candidates.length !== 1) return null;
  const entity = candidates[0];
  const personIds = [
    ...new Set([
      ...creditPersonIds(entity, "P57"),
      ...(creditPersonIds(entity, "P161").length
        ? creditPersonIds(entity, "P161")
        : creditPersonIds(entity, "P725")),
    ]),
  ];
  const people = personIds.length
    ? object(
        (
          await api({
            action: "wbgetentities",
            ids: personIds.join("|"),
            props: "labels",
            languages: "ja|en|mul",
          })
        ).entities,
      )
    : {};
  return extractMovieCredits(entity, people);
}

/** Do not substitute Japanese-only labels into the English UI. */
export function creditNames(
  people: CreditPerson[],
  language: "ja" | "en",
): string[] {
  return people.flatMap((person) => {
    const name = language === "en" ? person.en : (person.ja ?? person.en);
    return name ? [name] : [];
  });
}
