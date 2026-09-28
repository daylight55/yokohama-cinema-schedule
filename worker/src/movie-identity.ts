import { load } from "cheerio";
import { todayInJst } from "../../shared/date";
import {
  canonicalMovieKey,
  collectedMovieTitle,
} from "../../shared/movie-title-corrections";
import { movieDisplayTitle, moviePreferenceKey } from "../../shared/movie";
import type { NormalizedShowing } from "../../shared/types";

const TJOY_ORIGINS: Readonly<Record<string, string>> = {
  "tjoy-yokohama": "https://tjoy.jp/t-joy_yokohama",
  "yokohama-burg13": "https://tjoy.jp/yokohama_burg13",
};
const CACHE_MS = 30 * 86400_000;
const MAX_DETAIL_BYTES = 2 * 1024 * 1024;

/** One shared budget per refresh invocation; never retry a failed detail request. */
export class MovieIdentityBudget {
  remaining = 5;
  private stopped = new Set<string>();
  take(source: string): boolean {
    if (this.remaining <= 0 || this.stopped.has(source)) return false;
    this.remaining--;
    return true;
  }
  stop(source: string): void {
    this.stopped.add(source);
  }
}

interface Identity {
  source_movie_id: string;
  observed_title: string;
  canonical_title: string;
  verification: "official" | "observed";
  evidence_url: string | null;
  verified_at: string;
}

export function titleProblem(title: string): string | null {
  const text = movieDisplayTitle(title);
  if (!text || text.length > 500) return "empty_or_oversized_title";
  if (text.includes("\uFFFD")) return "invalid_title_encoding";
  if (
    /&#(?:x[\da-f]+|\d+);|&(?:amp|nbsp|lt|gt|quot);|<\/?[a-z][^>]*>/i.test(text)
  )
    return "markup_in_title";
  if (
    /^(?:未定|タイトル未定|調整中|上映スケジュール|undefined|null)$/i.test(text)
  )
    return "placeholder_title";
  return null;
}

export function tjoyDetailUrl(source: string, id: string): string | null {
  return TJOY_ORIGINS[source] && /^[CE]\d+$/.test(id)
    ? `${TJOY_ORIGINS[source]}/cinema_detail/${id}`
    : null;
}

export function parseTjoyMovieDetail(html: string, id: string): string {
  const $ = load(html);
  // Both a detail-page marker and its own movie ID are required. A login,
  // challenge, unrelated redirect or schedule page is never title evidence.
  const codes = $("[data-code]")
    .toArray()
    .map((el) => $(el).attr("data-code"));
  if (
    !$("body#film-detail").length ||
    !codes.length ||
    codes.some((code) => code !== id)
  ) {
    throw new Error("detail_identity_mismatch");
  }
  const headers = $(".carosuel-header")
    .toArray()
    .map((el) => movieDisplayTitle($(el).text()));
  if (headers.length !== 1 || titleProblem(headers[0]))
    throw new Error("invalid_detail_title");
  return headers[0];
}

export async function fetchTjoyMovieDetail(
  source: string,
  id: string,
): Promise<string> {
  const url = tjoyDetailUrl(source, id);
  if (!url) throw new Error("missing_stable_movie_id");
  // Fixed origin/path, no redirects, one request, bounded timeout and body size.
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "YokohamaCinemaSchedule/0.1",
      accept: "text/html",
      "accept-language": "ja",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`detail_http_${response.status}`);
  }
  if (!response.body) throw new Error("empty_detail_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    html = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DETAIL_BYTES) {
        await reader.cancel();
        throw new Error("detail_response_too_large");
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return parseTjoyMovieDetail(html, id);
}

// These are presentation labels, not parts/years/edition identifiers. Keep the
// published spelling when only one of these differs from the official detail.
const comparable = (title: string) => {
  const clean = movieDisplayTitle(title);
  const identity = clean
    .replace(
      /^(?:【[^】]*(?:応援上映|舞台挨拶|デビューdeシネマ)[^】]*】|\[[^\]]*(?:応援上映|舞台挨拶|デビューdeシネマ)[^\]]*\])\s*/g,
      "",
    )
    .replace(/\((?:赤ちゃん連れ限定|MV付(?:・(?:字幕|吹替)版)?)\)/g, "")
    .replace(/(?:リバイバル上映|復活上映)$/, "")
    .trim();
  return (identity || clean).replace(/[\s/]/g, "").toLowerCase();
};

const containsObservedTitles = (cached: string, observed: string) => {
  const known = new Set(cached.split("\n"));
  return observed.split("\n").every(title => known.has(title));
};

/** Reject an affected day as a whole; partial replacements would erase good rows. */
export async function validateSourceMovieTitles(
  db: D1Database,
  sourceId: string,
  rows: NormalizedShowing[],
  budget: MovieIdentityBudget,
  resolveDetail = fetchTjoyMovieDetail,
): Promise<{ showings: NormalizedShowing[]; dateErrors: Map<string, string> }> {
  const now = new Date().toISOString();
  const known = await db
    .prepare("SELECT * FROM source_movie_identity WHERE source_id=?")
    .bind(sourceId)
    .all<Identity>();
  const identities = new Map(
    known.results.map((row) => [row.source_movie_id, row]),
  );
  const pending = await db
    .prepare(
      "SELECT source_movie_id,observed_title,reason,next_check_at FROM movie_ingestion_issues WHERE source_id=? AND resolved_at IS NULL AND next_check_at > ?",
    )
    .bind(sourceId, now)
    .all<{
      source_movie_id: string;
      observed_title: string;
      reason: string;
      next_check_at: string;
    }>();
  const deferred = new Map(
    pending.results.map((row) => [
      JSON.stringify([row.source_movie_id, row.observed_title]),
      row,
    ]),
  );
  const groups = new Map<string, NormalizedShowing[]>();
  for (const row of rows) {
    const group = groups.get(row.movieKey) ?? [];
    group.push(row);
    groups.set(row.movieKey, group);
  }
  const dateErrors = new Map<string, string>();
  const accepted: NormalizedShowing[] = [];
  const statements: D1PreparedStatement[] = [];
  const candidates: Array<{
    id: string;
    title: string;
    officialTitle: string;
    observed: string;
    evidence: string | null;
    verification: "official" | "observed";
    rows: NormalizedShowing[];
  }> = [];
  const reject = (
    id: string,
    group: NormalizedShowing[],
    reason: string,
    nextCheck: string | null = null,
  ) => {
    for (const row of group)
      dateErrors.set(
        todayInJst(new Date(row.startsAt)),
        `Movie title requires review: ${id} (${reason})`,
      );
    for (const observed of new Set(
      group.map((row) => row.sourceTitle ?? row.title),
    )) {
      statements.push(
        db
          .prepare(
            `INSERT INTO movie_ingestion_issues
        (source_id,source_movie_id,observed_title,reason,evidence_url,first_seen_at,last_seen_at,resolved_at,next_check_at)
        VALUES (?,?,?,?,?,?,?,NULL,?) ON CONFLICT(source_id,source_movie_id,observed_title)
        DO UPDATE SET reason=excluded.reason,last_seen_at=excluded.last_seen_at,resolved_at=NULL,next_check_at=excluded.next_check_at`,
          )
          .bind(
            sourceId,
            id,
            observed,
            reason,
            tjoyDetailUrl(sourceId, id),
            now,
            now,
            nextCheck,
          ),
      );
    }
  };
  for (const [id, group] of groups) {
    const observedTitles = new Set(
      group.map((row) => collectedMovieTitle(row.title, sourceId, id)),
    );
    const cached = identities.get(id);
    const observed = [...observedTitles].sort().join("\n");
    let title = [...observedTitles][0];
    let evidence: string | null = null;
    let verification: "official" | "observed" = "observed";
    let problem: string | null = null;
    let nextCheck: string | null = null;
    const previousFailure = group
      .map((row) =>
        deferred.get(JSON.stringify([id, row.sourceTitle ?? row.title])),
      )
      .find(Boolean);
    if (TJOY_ORIGINS[sourceId]) {
      evidence = tjoyDetailUrl(sourceId, id);
      if (!evidence) problem = "missing_stable_movie_id";
      else if (
        cached?.verification === "official" &&
        containsObservedTitles(cached.observed_title, observed) &&
        Date.parse(now) - Date.parse(cached.verified_at) < CACHE_MS
      ) {
        title = cached.canonical_title;
        verification = "official";
      } else if (previousFailure) {
        problem = previousFailure.reason;
        nextCheck = previousFailure.next_check_at;
      } else if (!budget.take(sourceId)) problem = "detail_budget_exhausted";
      else {
        try {
          title = await resolveDetail(sourceId, id);
          problem = titleProblem(title);
          verification = "official";
        } catch (error) {
          const missing =
            error instanceof Error &&
            /^detail_http_(404|410)$/.test(error.message);
          if (!missing) budget.stop(sourceId);
          problem = missing ? "detail_not_found" : "detail_unavailable";
          nextCheck = new Date(
            Date.parse(now) + (missing ? 24 : 6) * 3600_000,
          ).toISOString();
        }
      }
    } else {
      problem =
        observedTitles.size > 1
          ? "conflicting_source_titles"
          : titleProblem(title);
    }
    if (!problem) problem = titleProblem(title);
    if (
      !problem &&
      cached &&
      comparable(cached.canonical_title) !== comparable(title)
    )
      problem = "source_title_changed";
    if (problem) {
      reject(id, group, problem, nextCheck);
      continue;
    }
    const publishedTitle =
      observedTitles.size === 1 && comparable(observed) === comparable(title)
        ? observed
        : title;
    candidates.push({
      id,
      title: publishedTitle,
      officialTitle: title,
      observed,
      evidence,
      verification,
      rows: group,
    });
  }
  // Detect key generation that would collapse meaningful qualifiers (part/year)
  // into an existing different title. Do not guess or rewrite that identity.
  const firstDate = rows.map(row => todayInJst(new Date(row.startsAt))).sort()[0];
  const comparisonStart = firstDate ? new Date(`${firstDate}T00:00:00+09:00`).toISOString() : now;
  const existing = await db
    .prepare("SELECT DISTINCT source_id,movie_key,title FROM showings WHERE starts_at >= ?")
    .bind(comparisonStart)
    .all<{ source_id: string; movie_key: string; title: string }>();
  const verified = await db
    .prepare(
      "SELECT source_id,observed_title,canonical_title FROM source_movie_identity WHERE verification='official'",
    )
    .all<{
      source_id: string;
      observed_title: string;
      canonical_title: string;
    }>();
  const aliases = new Map<string, string>();
  for (const row of [
    ...verified.results,
    ...candidates
      .filter((c) => c.verification === "official")
      .map((c) => ({
        source_id: sourceId,
        observed_title: c.observed,
        canonical_title: c.title,
      })),
  ]) {
    for (const observedTitle of row.observed_title.split("\n")) {
      aliases.set(
        JSON.stringify([row.source_id, comparable(observedTitle)]),
        row.canonical_title,
      );
    }
  }
  const titlesByKey = new Map<string, Set<string>>();
  for (const row of existing.results) {
    // Historical rows may still store a cinema ID or format-specific key.
    // User-facing movie identity is derived from the displayed title.
    const existingKey = canonicalMovieKey(moviePreferenceKey(row.title));
    const titles = titlesByKey.get(existingKey) ?? new Set<string>();
    titles.add(
      comparable(
        aliases.get(JSON.stringify([row.source_id, comparable(row.title)])) ??
          row.title,
      ),
    );
    titlesByKey.set(existingKey, titles);
  }
  for (const candidate of candidates) {
    const key = moviePreferenceKey(candidate.title);
    const titles = titlesByKey.get(key) ?? new Set<string>();
    titles.add(comparable(candidate.title));
    titlesByKey.set(key, titles);
  }
  for (const candidate of candidates) {
    const { id, title, officialTitle, observed, evidence, verification } =
      candidate;
    const newKey = moviePreferenceKey(title);
    const observedVariants = new Set(observed.split("\n").map(comparable));
    if (
      existing.results.some(
        (row) =>
          row.source_id === sourceId &&
          observedVariants.has(comparable(row.title)) &&
          canonicalMovieKey(moviePreferenceKey(row.title)) !== newKey,
      )
    ) {
      // Already-published identities may have user preferences/bookings. A new
      // verified title is evidence, not authorization to silently split them.
      reject(id, candidate.rows, "existing_movie_key_change");
      continue;
    }
    if ((titlesByKey.get(moviePreferenceKey(title))?.size ?? 0) > 1) {
      reject(id, candidate.rows, "canonical_key_collision");
      continue;
    }
    const cached = identities.get(id);
    // A cache hit must not extend its own expiry forever.
    const verifiedAt =
      cached && containsObservedTitles(cached.observed_title, observed) &&
      cached.verification === verification &&
      Date.parse(now) - Date.parse(cached.verified_at) < CACHE_MS
        ? cached.verified_at
        : now;
    statements.push(
      db
        .prepare(
          `INSERT INTO source_movie_identity
      (source_id,source_movie_id,observed_title,canonical_title,verification,evidence_url,verified_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_id,source_movie_id) DO UPDATE SET
      observed_title=excluded.observed_title,canonical_title=excluded.canonical_title,
      verification=excluded.verification,evidence_url=excluded.evidence_url,verified_at=excluded.verified_at`,
        )
        .bind(
          sourceId,
          id,
          verifiedAt === cached?.verified_at ? cached.observed_title : observed,
          officialTitle,
          verification,
          evidence,
          verifiedAt,
        ),
    );
    for (const sourceTitle of new Set(
      candidate.rows.map((row) => row.sourceTitle ?? row.title),
    )) {
      statements.push(
        db
          .prepare(
            "UPDATE movie_ingestion_issues SET resolved_at=? WHERE source_id=? AND source_movie_id=? AND observed_title=? AND resolved_at IS NULL",
          )
          .bind(now, sourceId, id, sourceTitle),
      );
    }
    accepted.push(
      ...candidate.rows.map((row) => {
        const observedTitle = movieDisplayTitle(row.title);
        // Official identity may omit a screening-event prefix. Preserve it as
        // format information rather than silently losing cheering/stage greetings.
        const prefix = observedTitle.endsWith(title)
          ? observedTitle.slice(0, -title.length).trim()
          : "";
        const qualifier = /^(?:【[^】]+】|\[[^\]]+\])+$/.test(prefix)
          ? prefix
          : "";
        return {
          ...row,
          title,
          sourceMovieId: id,
          sourceTitle: row.sourceTitle ?? row.title,
          format: [row.format, qualifier].filter(Boolean).join(" / ") || null,
        };
      }),
    );
  }
  if (statements.length) await db.batch(statements);
  return {
    showings: accepted.filter(
      (row) => !dateErrors.has(todayInJst(new Date(row.startsAt))),
    ),
    dateErrors,
  };
}
