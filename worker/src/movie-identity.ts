import { load } from "cheerio";
import { todayInJst } from "../../shared/date";
import { collectedMovieTitle } from "../../shared/movie-title-corrections";
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
  stop(source: string): void { this.stopped.add(source); }
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
  if (/&#(?:x[\da-f]+|\d+);|&(?:amp|nbsp|lt|gt|quot);|<\/?[a-z][^>]*>/i.test(text)) return "markup_in_title";
  if (/^(?:未定|タイトル未定|調整中|上映スケジュール|undefined|null)$/i.test(text)) return "placeholder_title";
  return null;
}

export function tjoyDetailUrl(source: string, id: string): string | null {
  return TJOY_ORIGINS[source] && /^C\d+$/.test(id)
    ? `${TJOY_ORIGINS[source]}/cinema_detail/${id}` : null;
}

export function parseTjoyMovieDetail(html: string, id: string): string {
  const $ = load(html);
  // Both a detail-page marker and its own movie ID are required. A login,
  // challenge, unrelated redirect or schedule page is never title evidence.
  if (!$("body#film-detail").length || !$("[data-code]").toArray().some((el) => $(el).attr("data-code") === id)) {
    throw new Error("detail_identity_mismatch");
  }
  const headers = $(".carosuel-header").toArray().map((el) => movieDisplayTitle($(el).text()));
  if (headers.length !== 1 || titleProblem(headers[0])) throw new Error("invalid_detail_title");
  return headers[0];
}

export async function fetchTjoyMovieDetail(source: string, id: string): Promise<string> {
  const url = tjoyDetailUrl(source, id);
  if (!url) throw new Error("missing_stable_movie_id");
  // Fixed origin/path, no redirects, one request, bounded timeout and body size.
  const response = await fetch(url, {
    redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "YokohamaCinemaSchedule/0.1", accept: "text/html", "accept-language": "ja" },
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`detail_http_${response.status}`); }
  if (!response.body) throw new Error("empty_detail_response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, html = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DETAIL_BYTES) { await reader.cancel(); throw new Error("detail_response_too_large"); }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally { reader.releaseLock(); }
  return parseTjoyMovieDetail(html, id);
}

const comparable = (title: string) => movieDisplayTitle(title).replace(/\s/g, "").toLowerCase();

/** Reject an affected day as a whole; partial replacements would erase good rows. */
export async function validateSourceMovieTitles(
  db: D1Database,
  sourceId: string,
  rows: NormalizedShowing[],
  budget: MovieIdentityBudget,
  resolveDetail = fetchTjoyMovieDetail,
): Promise<{ showings: NormalizedShowing[]; dateErrors: Map<string, string> }> {
  const now = new Date().toISOString();
  const known = await db.prepare("SELECT * FROM source_movie_identity WHERE source_id=?").bind(sourceId).all<Identity>();
  const identities = new Map(known.results.map((row) => [row.source_movie_id, row]));
  const groups = new Map<string, NormalizedShowing[]>();
  for (const row of rows) {
    const group = groups.get(row.movieKey) ?? [];
    group.push(row);
    groups.set(row.movieKey, group);
  }
  const dateErrors = new Map<string, string>();
  const accepted: NormalizedShowing[] = [];
  const statements: D1PreparedStatement[] = [];
  const candidates: Array<{ id: string; title: string; observed: string; evidence: string | null; verification: "official" | "observed"; rows: NormalizedShowing[] }> = [];
  const reject = (id: string, group: NormalizedShowing[], reason: string) => {
    for (const row of group) dateErrors.set(todayInJst(new Date(row.startsAt)), `Movie title requires review: ${id} (${reason})`);
    for (const observed of new Set(group.map((row) => row.sourceTitle ?? row.title))) {
      statements.push(db.prepare(`INSERT INTO movie_ingestion_issues
        (source_id,source_movie_id,observed_title,reason,evidence_url,first_seen_at,last_seen_at,resolved_at)
        VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(source_id,source_movie_id,observed_title)
        DO UPDATE SET reason=excluded.reason,last_seen_at=excluded.last_seen_at,resolved_at=NULL`)
        .bind(sourceId,id,observed,reason,tjoyDetailUrl(sourceId,id),now,now));
    }
  };
  for (const [id, group] of groups) {
    const observedTitles = new Set(group.map((row) => collectedMovieTitle(row.title,sourceId,id)));
    const cached = identities.get(id);
    const observed = [...observedTitles].sort().join("\n");
    let title = [...observedTitles][0];
    let evidence: string | null = null;
    let verification: "official" | "observed" = "observed";
    let problem: string | null = null;
    if (TJOY_ORIGINS[sourceId]) {
      evidence = tjoyDetailUrl(sourceId,id);
      if (!evidence) problem = "missing_stable_movie_id";
      else if (cached?.verification === "official" && cached.observed_title === observed && Date.parse(now)-Date.parse(cached.verified_at) < CACHE_MS) {
        title = cached.canonical_title;
        verification = "official";
      } else if (!budget.take(sourceId)) problem = "detail_budget_exhausted";
      else {
        try {
          title = await resolveDetail(sourceId,id);
          problem = titleProblem(title);
          verification = "official";
        } catch {
          budget.stop(sourceId);
          problem = "detail_unavailable";
        }
      }
    } else {
      problem = observedTitles.size > 1 ? "conflicting_source_titles" : titleProblem(title);
    }
    if (!problem && cached && comparable(cached.canonical_title) !== comparable(title)) problem = "source_title_changed";
    if (problem) { reject(id,group,problem); continue; }
    candidates.push({ id,title,observed,evidence,verification,rows:group });
  }
  // Detect key generation that would collapse meaningful qualifiers (part/year)
  // into an existing different title. Do not guess or rewrite that identity.
  const existing = await db.prepare("SELECT DISTINCT movie_key,title FROM showings").all<{movie_key:string;title:string}>();
  const titlesByKey = new Map<string, Set<string>>();
  for (const row of existing.results) {
    const titles = titlesByKey.get(row.movie_key) ?? new Set<string>();
    titles.add(comparable(row.title)); titlesByKey.set(row.movie_key,titles);
  }
  for (const candidate of candidates) {
    const key = moviePreferenceKey(candidate.title);
    const titles = titlesByKey.get(key) ?? new Set<string>();
    titles.add(comparable(candidate.title)); titlesByKey.set(key,titles);
  }
  for (const candidate of candidates) {
    const { id,title,observed,evidence,verification } = candidate;
    if ((titlesByKey.get(moviePreferenceKey(title))?.size ?? 0) > 1) {
      reject(id,candidate.rows,"canonical_key_collision"); continue;
    }
    const cached = identities.get(id);
    // A cache hit must not extend its own expiry forever.
    const verifiedAt = cached?.observed_title === observed && cached.verification === verification && Date.parse(now)-Date.parse(cached.verified_at) < CACHE_MS ? cached.verified_at : now;
    statements.push(db.prepare(`INSERT INTO source_movie_identity
      (source_id,source_movie_id,observed_title,canonical_title,verification,evidence_url,verified_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_id,source_movie_id) DO UPDATE SET
      observed_title=excluded.observed_title,canonical_title=excluded.canonical_title,
      verification=excluded.verification,evidence_url=excluded.evidence_url,verified_at=excluded.verified_at`)
      .bind(sourceId,id,observed,title,verification,evidence,verifiedAt));
    statements.push(db.prepare("UPDATE movie_ingestion_issues SET resolved_at=? WHERE source_id=? AND source_movie_id=? AND resolved_at IS NULL").bind(now,sourceId,id));
    accepted.push(...candidate.rows.map((row) => ({...row, title,sourceMovieId:id,sourceTitle:row.sourceTitle ?? row.title})));
  }
  if (statements.length) await db.batch(statements);
  return { showings: accepted.filter((row) => !dateErrors.has(todayInJst(new Date(row.startsAt)))),dateErrors };
}
