import { addDays, jstDateBounds, jstLocalToIso, todayInJst } from "../../shared/date";
import {
  DEFAULT_HOME_TRAVEL_MINUTES,
  optimizeMovieMarathon,
} from "../../shared/planner";
import type {
  Cinema,
  MovieMarathonPlan,
  MovieMarathonPlanItem,
  MovieMarathonProposal,
  Showing,
} from "../../shared/types";
import {
  applyCustomDuration,
  buildTransitRoutes,
  estimateRoute,
} from "../api/routes";
import { buildCinemaTransferMinutes } from "./cinema-transfers";
import {
  DEFAULT_TRAVEL_MODE,
  listCinemaTravelPreferences,
} from "./cinema-travel-preferences";
import { listActiveCinemas } from "./cinemas";
import type { PagesEnv } from "./env";
import { listMoviePreferences } from "./preferences";
import {
  estimateStationWalkFallbacks,
  listPreferredOriginStationIds,
  listStationConnections,
  listStations,
} from "./stations";
import { getHomeLocation, listHomeStationAccess } from "./user-profile";

interface ShowingRow {
  id: string;
  source_id: string;
  cinema_id: string;
  cinema_name: string;
  cinema_short_name: string;
  area: Showing["area"];
  movie_key: string;
  title: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  screen: string | null;
  format: string | null;
  booking_url: string;
  purchasable: number | null;
  fetched_at: string;
}

interface PlanRow {
  id: string;
  plan_date: string;
  available_start: string;
  available_end: string;
  status: MovieMarathonPlan["status"];
  google_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PlanItemRow {
  plan_id: string;
  showing_id: string;
  sequence: number;
  movie_key: string;
  title: string;
  cinema_id: string;
  cinema_name: string;
  starts_at: string;
  ends_at: string;
  booking_url: string;
  starred: number;
  transfer_minutes: number;
}

export function isPlannerDateAllowed(
  date: string,
  now = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = todayInJst(now);
  return date >= today && date <= addDays(today, 365);
}

export function plannerWindow(
  date: string,
  startTime: string,
  endTime: string,
): { start: string; end: string } {
  const start = jstLocalToIso(date, startTime);
  const end = jstLocalToIso(date, endTime);
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    throw new RangeError("invalid_planner_window");
  }
  return { start, end };
}

export async function listPlannerShowings(
  env: PagesEnv,
  date: string,
): Promise<Showing[]> {
  const [from, to] = jstDateBounds(date);
  const approvalClause =
    env.PUBLIC_MODE === "true"
      ? "c.approval = 'approved'"
      : "c.approval != 'disabled'";
  const result = await env.DB.prepare(
    `SELECT s.id, s.source_id, s.cinema_id, c.name AS cinema_name,
            c.short_name AS cinema_short_name, c.area, s.movie_key,
            s.title, s.image_url, s.starts_at, s.ends_at, s.screen,
            s.format, s.booking_url, s.purchasable, s.fetched_at
       FROM showings s
       JOIN cinemas c ON c.id = s.cinema_id
      WHERE s.starts_at >= ? AND s.starts_at < ?
        AND ${approvalClause}
        AND (c.active_until IS NULL OR c.active_until >= ?)
      ORDER BY s.starts_at, c.name, s.title`,
  )
    .bind(from, to, date)
    .all<ShowingRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    cinemaId: row.cinema_id,
    cinemaName: row.cinema_name,
    cinemaShortName: row.cinema_short_name,
    area: row.area,
    movieKey: row.movie_key,
    title: row.title,
    imageUrl: row.image_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    screen: row.screen,
    format: row.format,
    bookingUrl: row.booking_url,
    purchasable:
      row.purchasable === null ? null : Boolean(row.purchasable),
    fetchedAt: row.fetched_at,
  }));
}

async function homeTravelMinutes(
  env: PagesEnv,
  cinemas: Cinema[],
  userId: string,
): Promise<Map<string, number>> {
  const home = await getHomeLocation(env.DB, userId);
  if (!home) return new Map();
  const preferences = await listCinemaTravelPreferences(
    env.DB,
    cinemas,
    userId,
  );
  const preferenceByCinema = new Map(
    preferences.map((preference) => [preference.cinemaId, preference]),
  );
  const modeByCinema = new Map(
    preferences.map((preference) => [
      preference.cinemaId,
      preference.travelMode,
    ]),
  );
  const transitCinemas = cinemas.filter(
    (cinema) =>
      (modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE) === "transit",
  );
  const [stations, connections, preferredOriginStationIds] =
    await Promise.all([
      listStations(env.DB),
      listStationConnections(env.DB),
      listPreferredOriginStationIds(env.DB),
    ]);
  const stationById = new Map(
    stations.map((station) => [station.id, station]),
  );
  const storedWalks = await listHomeStationAccess(
    env.DB,
    stationById,
    userId,
  );
  const originStations =
    preferredOriginStationIds.size > 0
      ? stations.filter((station) =>
          preferredOriginStationIds.has(station.id),
        )
      : stations;
  const storedWalkByStation = new Map(
    storedWalks.map((walk) => [walk.station.id, walk]),
  );
  const stationWalks = originStations.map(
    (station) =>
      storedWalkByStation.get(station.id) ??
      estimateStationWalkFallbacks(
        home.latitude,
        home.longitude,
        [station],
      )[0],
  );
  const transitRoutes = buildTransitRoutes(
    home.latitude,
    home.longitude,
    transitCinemas,
    stationWalks,
    stations,
    connections,
    preferredOriginStationIds,
  );

  return new Map(
    cinemas.map((cinema) => {
      const travelMode =
        modeByCinema.get(cinema.id) ?? DEFAULT_TRAVEL_MODE;
      const route =
        transitRoutes.get(cinema.id) ??
        estimateRoute(
          home.latitude,
          home.longitude,
          cinema,
          travelMode,
        );
      return [
        cinema.id,
        applyCustomDuration(
          route,
          preferenceByCinema.get(cinema.id)?.customDurationMinutes ??
            null,
        ).durationMinutes,
      ];
    }),
  );
}

export async function generateMovieMarathonProposal(
  env: PagesEnv,
  date: string,
  startTime: string,
  endTime: string,
  userId = "legacy-local",
): Promise<MovieMarathonProposal> {
  const window = plannerWindow(date, startTime, endTime);
  const [showings, cinemas, preferences, connections] = await Promise.all([
    listPlannerShowings(env, date),
    listActiveCinemas(env.DB, date, env.PUBLIC_MODE === "true"),
    listMoviePreferences(env.DB, userId),
    listStationConnections(env.DB),
  ]);
  const hiddenMovieKeys = new Set(
    preferences
      .filter((preference) => preference.status !== null)
      .map((preference) => preference.movieKey),
  );
  const starredMovieKeys = new Set(
    preferences
      .filter(
        (preference) =>
          preference.starred && preference.status === null,
      )
      .map((preference) => preference.movieKey),
  );
  const eligibleShowings = showings.filter(
    (showing) => !hiddenMovieKeys.has(showing.movieKey),
  );
  const [homeTravel, transfers] = await Promise.all([
    homeTravelMinutes(env, cinemas, userId),
    Promise.resolve(buildCinemaTransferMinutes(cinemas, connections)),
  ]);

  return optimizeMovieMarathon({
    planDate: date,
    availableStart: window.start,
    availableEnd: window.end,
    showings: eligibleShowings,
    starredMovieKeys,
    homeTravelMinutesByCinema: homeTravel,
    transferMinutesByPair: transfers,
    defaultHomeTravelMinutes: DEFAULT_HOME_TRAVEL_MINUTES,
  });
}

export async function listMovieMarathonPlans(
  db: D1Database,
  userId = "legacy-local",
  date?: string,
): Promise<MovieMarathonPlan[]> {
  const query = date
    ? `SELECT * FROM movie_marathon_plans
        WHERE user_id = ? AND plan_date = ? ORDER BY updated_at DESC`
    : `SELECT * FROM movie_marathon_plans
        WHERE user_id = ? ORDER BY plan_date, updated_at DESC`;
  const statement = date
    ? db.prepare(query).bind(userId, date)
    : db.prepare(query).bind(userId);
  const result = await statement.all<PlanRow>();
  const rows = result.results ?? [];
  if (rows.length === 0) return [];
  const itemResult = await db
    .prepare(
      `SELECT * FROM movie_marathon_plan_showings
        WHERE plan_id IN (${rows.map(() => "?").join(", ")})
        ORDER BY plan_id, sequence`,
    )
    .bind(...rows.map((row) => row.id))
    .all<PlanItemRow>();
  const itemsByPlan = new Map<string, MovieMarathonPlanItem[]>();
  for (const row of itemResult.results ?? []) {
    const items = itemsByPlan.get(row.plan_id) ?? [];
    items.push({
      showingId: row.showing_id,
      sequence: row.sequence,
      movieKey: row.movie_key,
      title: row.title,
      cinemaId: row.cinema_id,
      cinemaName: row.cinema_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      bookingUrl: row.booking_url,
      starred: Boolean(row.starred),
      transferMinutes: row.transfer_minutes,
    });
    itemsByPlan.set(row.plan_id, items);
  }
  return rows.map((row) => ({
    id: row.id,
    planDate: row.plan_date,
    availableStart: row.available_start,
    availableEnd: row.available_end,
    status: row.status,
    googleCalendarEventId: row.google_calendar_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemsByPlan.get(row.id) ?? [],
  }));
}

export async function getMovieMarathonPlan(
  db: D1Database,
  planId: string,
  userId = "legacy-local",
): Promise<MovieMarathonPlan | null> {
  const row = await db
    .prepare(
      `SELECT plan_date FROM movie_marathon_plans
        WHERE id = ? AND user_id = ?`,
    )
    .bind(planId, userId)
    .first<{ plan_date: string }>();
  if (!row) return null;
  const plans = await listMovieMarathonPlans(db, userId, row.plan_date);
  return plans.find((plan) => plan.id === planId) ?? null;
}

export async function saveMovieMarathonPlan(
  db: D1Database,
  proposal: MovieMarathonProposal,
  userId = "legacy-local",
): Promise<MovieMarathonPlan> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = proposal.items.length > 0 ? "planned" : "draft";
  await db.batch([
    db
      .prepare(
        `INSERT INTO movie_marathon_plans (
           id, user_id, plan_date, available_start, available_end, status,
           google_calendar_event_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        id,
        userId,
        proposal.planDate,
        proposal.availableStart,
        proposal.availableEnd,
        status,
        now,
        now,
      ),
    ...proposal.items.map((item) =>
      db
        .prepare(
          `INSERT INTO movie_marathon_plan_showings (
             plan_id, showing_id, sequence, movie_key, title, cinema_id,
             cinema_name, starts_at, ends_at, booking_url, starred,
             transfer_minutes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          item.showingId,
          item.sequence,
          item.movieKey,
          item.title,
          item.cinemaId,
          item.cinemaName,
          item.startsAt,
          item.endsAt,
          item.bookingUrl,
          item.starred ? 1 : 0,
          item.transferMinutes,
        ),
    ),
  ]);
  return {
    id,
    planDate: proposal.planDate,
    availableStart: proposal.availableStart,
    availableEnd: proposal.availableEnd,
    status,
    googleCalendarEventId: null,
    createdAt: now,
    updatedAt: now,
    items: proposal.items,
  };
}

export async function deleteMovieMarathonPlan(
  db: D1Database,
  planId: string,
  userId = "legacy-local",
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM movie_marathon_plans WHERE id = ? AND user_id = ?")
    .bind(planId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markPlanCalendarEvent(
  db: D1Database,
  planId: string,
  eventId: string,
  userId = "legacy-local",
): Promise<void> {
  await db
    .prepare(
      `UPDATE movie_marathon_plans
          SET google_calendar_event_id = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    )
    .bind(eventId, new Date().toISOString(), planId, userId)
    .run();
}
