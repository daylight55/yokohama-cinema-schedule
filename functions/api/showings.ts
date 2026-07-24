import { jstDateBounds, todayInJst } from "../../shared/date";
import type { ScheduleResponse, Showing } from "../../shared/types";
import { listActiveCinemas } from "../_lib/cinemas";
import type { PagesEnv } from "../_lib/env";
import { listCinemaTravelPreferences } from "../_lib/cinema-travel-preferences";
import { listStarredPreferences } from "../_lib/preferences";
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

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const url = new URL(context.request.url);
  const date = url.searchParams.get("date") ?? todayInJst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "invalid_date" }, { status: 400 });
  }
  const [from, to] = jstDateBounds(date);
  const publicOnly = context.env.PUBLIC_MODE === "true";
  const approvalClause = publicOnly
    ? "c.approval = 'approved'"
    : "c.approval != 'disabled'";

  const [showingResult, health, cinemas] = await Promise.all([
    context.env.DB.prepare(
      `SELECT
        s.id, s.source_id, s.cinema_id, c.name AS cinema_name,
        c.short_name AS cinema_short_name, c.area, s.movie_key, s.title,
        s.image_url,
        s.starts_at, s.ends_at, s.screen, s.format, s.booking_url,
        s.purchasable, s.fetched_at
      FROM showings s
      JOIN cinemas c ON c.id = s.cinema_id
      WHERE s.starts_at >= ? AND s.starts_at < ? AND ${approvalClause}
        AND (c.active_until IS NULL OR c.active_until >= ?)
      ORDER BY s.starts_at ASC, c.name ASC`,
    )
      .bind(from, to, date)
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
        : listStarredPreferences(context.env.DB),
      publicOnly
        ? Promise.resolve([])
        : listCinemaTravelPreferences(context.env.DB, cinemas),
      publicOnly
        ? Promise.resolve({
            homeRegistered: false,
            homeUpdatedAt: null,
          })
        : getUserProfile(context.env.DB),
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
