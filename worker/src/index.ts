import { CINEMAS } from "../../shared/cinemas";
import { activeDatesForCinema } from "../../shared/cinema-availability";
import {
  compactDate,
  dateRange,
  timestampForCacheBuster,
  todayInJst,
} from "../../shared/date";
import type { NormalizedShowing } from "../../shared/types";
import { parseAeonSchedule } from "./parsers/aeon";
import { parseEigalandSchedule } from "./parsers/eigaland";
import { parseKinoMovieImages, parseKinoSchedule } from "./parsers/kino";
import { parseMovilMovieImages, parseMovilSchedule } from "./parsers/movil";
import { parseTohoSchedule } from "./parsers/toho";
import { parseTjoySchedule } from "./parsers/tjoy";
import {
  parseUnitedMovieImages,
  parseUnitedSchedule,
} from "./parsers/united";

interface Env {
  DB: D1Database;
  SCHEDULE_DAYS?: string;
  WORKER_TRIGGER_TOKEN?: string;
}

interface Source {
  id: string;
  fetch: (dates: string[]) => Promise<NormalizedShowing[]>;
}

interface ActiveCinemaWindow {
  id: string;
  active_until: string | null;
}

const USER_AGENT =
  "YokohamaCinemaSchedule/0.1 (private personal schedule viewer)";

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(refreshAll(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }
    if (request.method !== "POST" || url.pathname !== "/refresh") {
      return new Response("Not found", { status: 404 });
    }
    if (
      !env.WORKER_TRIGGER_TOKEN ||
      request.headers.get("authorization") !==
        `Bearer ${env.WORKER_TRIGGER_TOKEN}`
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await refreshAll(env);
    return Response.json(result, {
      status: result.failed === 0 ? 200 : 207,
      headers: { "cache-control": "no-store" },
    });
  },
} satisfies ExportedHandler<Env>;

export async function refreshAll(env: Env): Promise<{
  startedAt: string;
  completedAt: string;
  succeeded: number;
  failed: number;
  sources: Array<{
    sourceId: string;
    status: "success" | "failed";
    count: number;
    error?: string;
  }>;
}> {
  const startedAt = new Date().toISOString();
  const days = Math.min(Math.max(Number(env.SCHEDULE_DAYS ?? "7"), 1), 14);
  const dates = dateRange(todayInJst(), days);
  await seedCinemas(env.DB);

  const activeCinemaWindows = await listActiveCinemaWindows(
    env.DB,
    dates[0],
  );
  const sources = buildSources();
  const results: Array<{
    sourceId: string;
    status: "success" | "failed";
    count: number;
    error?: string;
  }> = [];
  // 取得元へ短時間に大量のリクエストを送らないよう、映画館単位で直列実行する。
  for (const source of sources) {
    const cinemaWindow = activeCinemaWindows.get(source.id);
    if (!cinemaWindow) continue;
    const sourceDates = activeDatesForCinema(
      dates,
      cinemaWindow.active_until,
    );
    if (sourceDates.length === 0) continue;

    const sourceStartedAt = new Date().toISOString();
    try {
      const showings = deduplicate(await source.fetch(sourceDates));
      if (showings.length === 0) {
        throw new Error("上映回を1件も取得できませんでした");
      }
      await replaceSourceWindow(env.DB, source.id, sourceDates, showings);
      await recordRun(
        env.DB,
        source.id,
        sourceStartedAt,
        "success",
        showings.length,
      );
      results.push({
        sourceId: source.id,
        status: "success",
        count: showings.length,
      });
    } catch (error) {
      const message = safeError(error);
      console.error("Schedule refresh failed", {
        sourceId: source.id,
        message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await recordRun(
        env.DB,
        source.id,
        sourceStartedAt,
        "failed",
        0,
        message,
      );
      results.push({
        sourceId: source.id,
        status: "failed",
        count: 0,
        error: message,
      });
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    succeeded: results.filter((result) => result.status === "success").length,
    failed: results.filter((result) => result.status === "failed").length,
    sources: results,
  };
}

function buildSources(): Source[] {
  return [
    {
      id: "tjoy-yokohama",
      fetch: (dates) =>
        fetchTjoy(
          dates,
          "tjoy-yokohama",
          "tjoy-yokohama",
          "https://tjoy.jp/t-joy_yokohama",
          "190",
        ),
    },
    {
      id: "movil",
      fetch: fetchMovil,
    },
    {
      id: "toho-kamiooka",
      fetch: fetchTohoKamiooka,
    },
    {
      id: "yokohama-burg13",
      fetch: (dates) =>
        fetchTjoy(
          dates,
          "yokohama-burg13",
          "yokohama-burg13",
          "https://tjoy.jp/yokohama_burg13",
          "170",
        ),
    },
    {
      id: "aeon-minatomirai",
      fetch: fetchAeon,
    },
    {
      id: "united-minatomirai",
      fetch: fetchUnited,
    },
    {
      id: "kino-minatomirai",
      fetch: fetchKino,
    },
    {
      id: "jack-and-betty",
      fetch: (dates) =>
        fetchEigaland(
          dates,
          "jack-and-betty",
          "jack-and-betty",
          "f005657d-7131-479e-a734-c42c14d98f9f",
          "https://www.jackandbetty.net/",
        ),
    },
    {
      id: "cinemarine",
      fetch: (dates) =>
        fetchEigaland(
          dates,
          "cinemarine",
          "cinemarine",
          "4d6c9e5f-bcca-4635-abe4-6f0db498a8bc",
          "https://cinemarine.co.jp/",
        ),
    },
  ];
}

async function fetchAeon(dates: string[]): Promise<NormalizedShowing[]> {
  const url = new URL(
    "https://theater.aeoncinema.com/schedule/v2/data/minatomirai/schedule.json",
  );
  url.searchParams.set("v", timestampForCacheBuster());
  const response = await checkedFetch(url);
  return parseAeonSchedule(await response.json(), new Set(dates));
}

async function fetchMovil(dates: string[]): Promise<NormalizedShowing[]> {
  const movieImages = await fetchOptionalMovieImages(
    "https://109cinemas.net/nowshowing/",
    parseMovilMovieImages,
  );
  const showings: NormalizedShowing[] = [];
  for (const date of dates) {
    const url = `https://109cinemas.net/movil/schedules/${compactDate(date)}.html?theater_code=72`;
    const response = await checkedFetch(url);
    showings.push(
      ...parseMovilSchedule(await response.text(), date, movieImages),
    );
  }
  return showings;
}

async function fetchTohoKamiooka(
  dates: string[],
): Promise<NormalizedShowing[]> {
  const showings: NormalizedShowing[] = [];
  const bookingUrl =
    "https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do";
  for (const date of dates) {
    const url = new URL(
      "https://api2.tohotheater.jp/api/schedule/v1/schedule/066/TNPI3050J02",
    );
    url.searchParams.set("__type__", "html");
    url.searchParams.set("__useResultInfo__", "no");
    url.searchParams.set("vg_cd", "066");
    url.searchParams.set("show_day", compactDate(date));
    url.searchParams.set("term", "99");
    url.searchParams.set("isMember", "");
    url.searchParams.set("enter_kbn", "");
    url.searchParams.set("_dc", String(Date.now()));
    const response = await checkedFetch(url, {
      headers: {
        accept: "application/json",
        referer: "https://hlo.tohotheater.jp/",
      },
    });
    showings.push(
      ...parseTohoSchedule(
        await response.json(),
        date,
        "toho-kamiooka",
        "toho-kamiooka",
        bookingUrl,
      ),
    );
  }
  return showings;
}

async function fetchUnited(dates: string[]): Promise<NormalizedShowing[]> {
  const decoder = new TextDecoder("shift_jis");
  const movieImages = await fetchOptionalMovieImages(
    "https://www.unitedcinemas.jp/minatomirai/film.php",
    parseUnitedMovieImages,
    async (response) => decoder.decode(await response.arrayBuffer()),
  );
  const showings: NormalizedShowing[] = [];
  for (const date of dates) {
    const url = `https://www.unitedcinemas.jp/minatomirai/daily.php?date=${date}`;
    const response = await checkedFetch(url);
    showings.push(
      ...parseUnitedSchedule(
        decoder.decode(await response.arrayBuffer()),
        date,
        movieImages,
      ),
    );
  }
  return showings;
}

async function fetchKino(dates: string[]): Promise<NormalizedShowing[]> {
  const [scheduleResponse, movieImages] = await Promise.all([
    checkedFetch("https://kinocinema.jp/minatomirai/"),
    fetchOptionalMovieImages(
      "https://kinocinema.jp/minatomirai/movie/",
      parseKinoMovieImages,
    ),
  ]);
  return parseKinoSchedule(
    await scheduleResponse.text(),
    dates[0],
    movieImages,
  );
}

async function fetchOptionalMovieImages(
  url: string,
  parse: (html: string) => Map<string, string>,
  decode: (response: Response) => Promise<string> = (response) =>
    response.text(),
): Promise<Map<string, string>> {
  try {
    const response = await checkedFetch(url);
    return parse(await decode(response));
  } catch (error) {
    console.warn("Movie image enrichment failed", {
      host: new URL(url).hostname,
      message: safeError(error),
    });
    return new Map();
  }
}

async function fetchEigaland(
  dates: string[],
  sourceId: string,
  cinemaId: string,
  webKey: string,
  bookingUrl: string,
): Promise<NormalizedShowing[]> {
  const showings: NormalizedShowing[] = [];
  for (const date of dates) {
    const url = new URL(
      "https://schedule.eigaland.com/api/schedulePage/show/listByCinemaIdAndDate",
    );
    url.searchParams.set("webKey", webKey);
    url.searchParams.set("date", date);
    const response = await checkedFetch(url);
    showings.push(
      ...parseEigalandSchedule(
        await response.json(),
        sourceId,
        cinemaId,
        bookingUrl,
      ),
    );
  }
  return showings;
}

async function fetchTjoy(
  dates: string[],
  sourceId: string,
  cinemaId: string,
  theaterUrl: string,
  theaterId: string,
): Promise<NormalizedShowing[]> {
  const initial = await checkedFetch(theaterUrl);
  const html = await initial.text();
  const setCookie = initial.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((part) => part.trim().split(";")[0])
    .join("; ");
  const csrf =
    html.match(
      /<input[^>]+name=["']_csrfToken["'][^>]+value=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    setCookie.match(/(?:^|,\s*)csrfToken=([^;,]+)/)?.[1];
  if (!csrf) throw new Error("T-JoyのCSRFトークンを取得できませんでした");

  const days: NormalizedShowing[] = [];
  for (const date of dates) {
    const body = new URLSearchParams({
      data: JSON.stringify({ date, theaterId }),
      _csrfToken: csrf,
    });
    const response = await checkedFetch(
      "https://tjoy.jp/theaterTop/scheduleGetHtmlApi",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          cookie,
          referer: theaterUrl,
        },
        body,
      },
    );
    days.push(
      ...parseTjoySchedule(
        await response.text(),
        date,
        sourceId,
        cinemaId,
        theaterUrl,
      ),
    );
  }
  return days;
}

async function checkedFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = new Headers(init.headers);
    headers.set("user-agent", USER_AGENT);
    headers.set("accept-language", "ja,en;q=0.5");
    const response = await fetch(input, {
      ...init,
      headers,
      redirect: "follow",
    });
    if (response.ok) return response;
    if (
      attempt === 0 &&
      (response.status === 429 || response.status >= 500)
    ) {
      await delay(300);
      continue;
    }
    throw new Error(
      `${new URL(input.toString()).hostname}: HTTP ${response.status}`,
    );
  }
  throw new Error(`${new URL(input.toString()).hostname}: fetch failed`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function seedCinemas(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  await db.batch(
    CINEMAS.map((cinema) =>
      db
        .prepare(
          `INSERT INTO cinemas (
            id, name, short_name, area, area_label, address, latitude, longitude,
            source_url, active_until, approval, nearest_station_id,
            station_walk_minutes, station_walk_distance_meters, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            short_name = excluded.short_name,
            area = excluded.area,
            area_label = excluded.area_label,
            address = excluded.address,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            source_url = excluded.source_url,
            updated_at = excluded.updated_at`,
        )
        .bind(
          cinema.id,
          cinema.name,
          cinema.shortName,
          cinema.area,
          cinema.areaLabel,
          cinema.address,
          cinema.latitude,
          cinema.longitude,
          cinema.sourceUrl,
          cinema.activeUntil,
          cinema.approval,
          cinema.nearestStationId,
          cinema.stationWalkMinutes,
          cinema.stationWalkDistanceMeters,
          now,
        ),
    ),
  );
}

async function listActiveCinemaWindows(
  db: D1Database,
  date: string,
): Promise<Map<string, ActiveCinemaWindow>> {
  const result = await db
    .prepare(
      `SELECT id, active_until
      FROM cinemas
      WHERE approval != 'disabled'
        AND (active_until IS NULL OR active_until >= ?)`,
    )
    .bind(date)
    .all<ActiveCinemaWindow>();
  return new Map(
    (result.results ?? []).map((cinema) => [cinema.id, cinema]),
  );
}

async function replaceSourceWindow(
  db: D1Database,
  sourceId: string,
  dates: string[],
  showings: NormalizedShowing[],
): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const start = `${dates[0]}T00:00:00+09:00`;
  const dayAfter = new Date(
    new Date(`${dates.at(-1)}T00:00:00+09:00`).getTime() + 86_400_000,
  ).toISOString();
  const statements = [
    db
      .prepare(
        "DELETE FROM showings WHERE source_id = ? AND starts_at >= ? AND starts_at < ?",
      )
      .bind(sourceId, new Date(start).toISOString(), dayAfter),
    ...showings.map((showing) => {
      const id = showingId(showing);
      return db
        .prepare(
          `INSERT INTO showings (
            id, source_id, cinema_id, movie_key, title, image_url,
            starts_at, ends_at,
            screen, format, booking_url, purchasable, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          showing.sourceId,
          showing.cinemaId,
          showing.movieKey,
          showing.title,
          showing.imageUrl,
          showing.startsAt,
          showing.endsAt,
          showing.screen,
          showing.format,
          showing.bookingUrl,
          showing.purchasable === null ? null : Number(showing.purchasable),
          fetchedAt,
        );
    }),
  ];
  await db.batch(statements);
}

async function recordRun(
  db: D1Database,
  sourceId: string,
  startedAt: string,
  status: "success" | "failed",
  count: number,
  errorMessage: string | null = null,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const id = `${sourceId}:${completedAt}:${crypto.randomUUID()}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO fetch_runs (
          id, source_id, started_at, completed_at, status, showing_count,
          error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        sourceId,
        startedAt,
        completedAt,
        status,
        count,
        errorMessage,
      ),
    db
      .prepare(
        `INSERT INTO source_health (
          source_id, last_attempt_at, last_success_at, status, showing_count,
          error_message
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          last_attempt_at = excluded.last_attempt_at,
          last_success_at = CASE
            WHEN excluded.status = 'healthy' THEN excluded.last_success_at
            ELSE source_health.last_success_at
          END,
          status = excluded.status,
          showing_count = excluded.showing_count,
          error_message = excluded.error_message`,
      )
      .bind(
        sourceId,
        completedAt,
        status === "success" ? completedAt : null,
        status === "success" ? "healthy" : "error",
        count,
        errorMessage,
      ),
  ]);
}

function deduplicate(showings: NormalizedShowing[]): NormalizedShowing[] {
  return [
    ...new Map(showings.map((showing) => [showingId(showing), showing])).values(),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function showingId(showing: NormalizedShowing): string {
  return [
    showing.sourceId,
    showing.cinemaId,
    showing.movieKey,
    showing.startsAt,
    showing.screen ?? "",
  ].join("|");
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, " ").slice(0, 500);
}
