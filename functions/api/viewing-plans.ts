import type { AuthContextData, PagesEnv } from "../_lib/env";
import type {
  ViewingPlan,
  ViewingPlansResponse,
} from "../../shared/types";

interface ShowingSnapshotRow {
  showing_id: string;
  movie_key: string;
  title: string;
  cinema_id: string;
  cinema_name: string;
  cinema_short_name: string;
  starts_at: string;
  ends_at: string | null;
  screen: string | null;
  format: string | null;
  booking_url: string;
}

interface ViewingPlanRow extends ShowingSnapshotRow {
  reserved_at: string | null;
  created_at: string;
  updated_at: string;
}

function unavailable(): Response {
  return Response.json(
    { error: "viewing_plans_unavailable" },
    { status: 403 },
  );
}

function noStore(response: Response): Response {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function planFromRow(row: ViewingPlanRow): ViewingPlan {
  return {
    showingId: row.showing_id,
    movieKey: row.movie_key,
    title: row.title,
    cinemaId: row.cinema_id,
    cinemaName: row.cinema_name,
    cinemaShortName: row.cinema_short_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    screen: row.screen,
    format: row.format,
    bookingUrl: row.booking_url,
    reservedAt: row.reserved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  const result = await context.env.DB.prepare(
    `SELECT
      showing_id,
      movie_key,
      title,
      cinema_id,
      cinema_name,
      cinema_short_name,
      starts_at,
      ends_at,
      screen,
      format,
      booking_url,
      reserved_at,
      created_at,
      updated_at
    FROM viewing_plans
    WHERE user_id = ?
      AND datetime(starts_at) > CURRENT_TIMESTAMP
    ORDER BY starts_at ASC`,
  )
    .bind(context.data.userId)
    .all<ViewingPlanRow>();

  const response: ViewingPlansResponse = {
    plans: result.results.map(planFromRow),
  };
  return noStore(Response.json(response));
};

export const onRequestPost: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  let body: { showingId?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const showingId =
    typeof body.showingId === "string" ? body.showingId.trim() : "";
  if (!showingId || showingId.length > 300) {
    return Response.json(
      { error: "invalid_showing_id" },
      { status: 400 },
    );
  }

  const showing = await context.env.DB.prepare(
    `SELECT
      s.id AS showing_id,
      s.movie_key,
      s.title,
      s.cinema_id,
      c.name AS cinema_name,
      c.short_name AS cinema_short_name,
      s.starts_at,
      s.ends_at,
      s.screen,
      s.format,
      s.booking_url
    FROM showings s
    INNER JOIN cinemas c ON c.id = s.cinema_id
    WHERE s.id = ?`,
  )
    .bind(showingId)
    .first<ShowingSnapshotRow>();

  if (!showing) {
    return Response.json({ error: "showing_not_found" }, { status: 404 });
  }

  const startsAt = new Date(showing.starts_at);
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) {
    return Response.json(
      { error: "showing_already_started" },
      { status: 409 },
    );
  }

  const updatedAt = new Date().toISOString();
  await context.env.DB.prepare(
    `INSERT INTO viewing_plans (
      user_id,
      showing_id,
      movie_key,
      title,
      cinema_id,
      cinema_name,
      cinema_short_name,
      starts_at,
      ends_at,
      screen,
      format,
      booking_url,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, showing_id) DO UPDATE SET
      movie_key = excluded.movie_key,
      title = excluded.title,
      cinema_id = excluded.cinema_id,
      cinema_name = excluded.cinema_name,
      cinema_short_name = excluded.cinema_short_name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      screen = excluded.screen,
      format = excluded.format,
      booking_url = excluded.booking_url,
      updated_at = excluded.updated_at`,
  )
    .bind(
      context.data.userId,
      showing.showing_id,
      showing.movie_key,
      showing.title,
      showing.cinema_id,
      showing.cinema_name,
      showing.cinema_short_name,
      showing.starts_at,
      showing.ends_at,
      showing.screen,
      showing.format,
      showing.booking_url,
      updatedAt,
      updatedAt,
    )
    .run();

  return noStore(
    Response.json(
      planFromRow({
        ...showing,
        reserved_at: null,
        created_at: updatedAt,
        updated_at: updatedAt,
      }),
      { status: 201 },
    ),
  );
};

export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  const showingId = new URL(context.request.url).searchParams.get("id")?.trim();
  if (!showingId) {
    return Response.json(
      { error: "missing_showing_id" },
      { status: 400 },
    );
  }

  let body: { reserved?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.reserved !== "boolean") {
    return Response.json({ error: "invalid_reserved" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const result = await context.env.DB.prepare(
    `UPDATE viewing_plans
    SET reserved_at = ?, updated_at = ?
    WHERE showing_id = ?
      AND user_id = ?`,
  )
    .bind(
      body.reserved ? updatedAt : null,
      updatedAt,
      showingId,
      context.data.userId,
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return Response.json(
      { error: "viewing_plan_not_found" },
      { status: 404 },
    );
  }
  return noStore(new Response(null, { status: 204 }));
};

export const onRequestDelete: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (context) => {
  if (context.env.PUBLIC_MODE === "true") return unavailable();

  const showingId = new URL(context.request.url).searchParams.get("id")?.trim();
  if (!showingId) {
    return Response.json(
      { error: "missing_showing_id" },
      { status: 400 },
    );
  }

  const result = await context.env.DB.prepare(
    `DELETE FROM viewing_plans
    WHERE showing_id = ?
      AND user_id = ?`,
  )
    .bind(showingId, context.data.userId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return Response.json(
      { error: "viewing_plan_not_found" },
      { status: 404 },
    );
  }
  return noStore(new Response(null, { status: 204 }));
};
