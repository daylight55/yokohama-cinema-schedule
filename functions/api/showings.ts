import { addDays, jstDateBounds, todayInJst } from "../../shared/date";
import {
  normalizeSearchQuery,
  searchMatchExpression,
} from "../../shared/search";
import type { ScheduleResponse, Showing } from "../../shared/types";
import { listActiveCinemas } from "../_lib/cinemas";
import {
  requireProfileEncryptionKey,
  type AuthContextData,
  type PagesEnv,
} from "../_lib/env";
import { listCinemaTravelPreferences } from "../_lib/cinema-travel-preferences";
import { listMoviePreferences } from "../_lib/preferences";
import { getUserProfile } from "../_lib/user-profile";

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
  release_date: string | null;
  starts_at: string;
  ends_at: string | null;
  screen: string | null;
  format: string | null;
  booking_url: string;
  purchasable: number | null;
  fetched_at: string;
}

interface HealthRow {
  healthy: number;
  total: number;
  last_updated_at: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SHOWING_RANGE_DAYS = 7;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  try {
    return addDays(value, 0) === value;
  } catch {
    return false;
  }
}

export function resolveShowingDateRange(
  searchParams: URLSearchParams,
  today = todayInJst(),
): { date: string; through: string } | null {
  const date = searchParams.get("date") ?? today;
  const through = searchParams.get("through") ?? date;
  if (
    !isValidIsoDate(date) ||
    !isValidIsoDate(through) ||
    through < date ||
    through > addDays(date, MAX_SHOWING_RANGE_DAYS - 1)
  ) {
    return null;
  }
  return { date, through };
}

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  const url = new URL(context.request.url);
  const dateRange = resolveShowingDateRange(url.searchParams);
  const searchQuery = normalizeSearchQuery(url.searchParams.get("q"));
  const searchExpression = searchMatchExpression(searchQuery);
  if (!dateRange) {
    return Response.json({ error: "invalid_date_range" }, { status: 400 });
  }
  const { date, through } = dateRange;
  const [from] = jstDateBounds(date);
  const [, to] = jstDateBounds(through);
  const publicOnly = context.env.PUBLIC_MODE === "true";
  const approvalClause = publicOnly
    ? "c.approval = 'approved'"
    : "c.approval != 'disabled'";
  const searchClause = searchExpression
    ? `AND s.id IN (
        SELECT showing_id
        FROM showing_search
        WHERE schedule_date >= ? AND schedule_date <= ? AND search_text MATCH ?
      )`
    : "";
  const showingBindings = searchExpression
    ? [from, to, date, date, through, searchExpression]
    : [from, to, date];

  const [showingResult, health, cinemas] = await Promise.all([
    context.env.DB.prepare(
      `SELECT
        s.id, s.source_id, s.cinema_id, c.name AS cinema_name,
        c.short_name AS cinema_short_name, c.area, s.movie_key, s.title,
        s.image_url, s.release_date,
        s.starts_at, s.ends_at, s.screen, s.format, s.booking_url,
        s.purchasable, s.fetched_at
      FROM showings s
      JOIN cinemas c ON c.id = s.cinema_id
      WHERE s.starts_at >= ? AND s.starts_at < ? AND ${approvalClause}
        AND (c.active_until IS NULL OR c.active_until >= ?)
        ${searchClause}
      ORDER BY s.starts_at ASC, c.name ASC`,
    )
      .bind(...showingBindings)
      .all<ShowingRow>(),
    context.env.DB.prepare(
      `SELECT
        SUM(CASE WHEN sh.status = 'healthy' THEN 1 ELSE 0 END) AS healthy,
        COUNT(*) AS total,
        MAX(sh.last_success_at) AS last_updated_at
      FROM source_health sh
      JOIN cinemas c ON c.id = sh.source_id
      WHERE ${approvalClause}
        AND (c.active_until IS NULL OR c.active_until >= ?)`,
    )
      .bind(date)
      .first<HealthRow>(),
    listActiveCinemas(context.env.DB, date, publicOnly),
  ]);
  const [preferences, cinemaTravelPreferences, userProfile] =
    await Promise.all([
      publicOnly
        ? Promise.resolve([])
        : listMoviePreferences(context.env.DB, context.data.userId),
      publicOnly
        ? Promise.resolve([])
        : listCinemaTravelPreferences(
            context.env.DB,
            cinemas,
            context.data.userId,
          ),
      publicOnly
          ? Promise.resolve({
            departureRegistered: false,
            departureUpdatedAt: null,
            scheduleCollapseMinutes: 60 as const,
          })
        : getUserProfile(
            context.env.DB,
            requireProfileEncryptionKey(context.env),
            context.data.userId,
          ),
    ]);

  const showings: Showing[] = (showingResult.results ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    cinemaId: row.cinema_id,
    cinemaName: row.cinema_name,
    cinemaShortName: row.cinema_short_name,
    area: row.area,
    movieKey: row.movie_key,
    title: row.title,
    imageUrl: row.image_url,
    releaseDate: row.release_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    screen: row.screen,
    format: row.format,
    bookingUrl: row.booking_url,
    purchasable:
      row.purchasable === null ? null : Boolean(row.purchasable),
    fetchedAt: row.fetched_at,
  }));

  const response: ScheduleResponse = {
    date,
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: health?.last_updated_at ?? null,
    cinemas,
    showings,
    preferences,
    preferencesEnabled: !publicOnly,
    cinemaTravelPreferences,
    cinemaTravelPreferencesEnabled: !publicOnly,
    userProfile,
    userProfileEnabled: !publicOnly,
    sourceHealth: {
      healthy: Number(health?.healthy ?? 0),
      total: Number(health?.total ?? 0),
    },
  };
  return Response.json(response, {
    headers: { "cache-control": "private, max-age=60" },
  });
};
