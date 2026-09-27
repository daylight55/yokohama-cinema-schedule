import { moviePreferenceKey } from "../../shared/movie";
import { addDays, todayInJst, jstDateBounds } from "../../shared/date";
import { avatarUrl, profileName } from "../../shared/member-profile";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import type {
  SharingResponse,
  SharedMember,
  SharedPlan,
  SharedMovie,
} from "../../shared/sharing";

const headers = { "cache-control": "private, no-store" };
// Every data query is scoped to a group authorized for the viewer.
const registered = "u.status = 'active' AND u.email IS NOT NULL";
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (ctx) => {
  if (
    ctx.env.PUBLIC_MODE === "true" ||
    !ctx.data.userId ||
    ctx.data.authUser?.status !== "active"
  ) {
    return Response.json(
      { error: "sharing_unavailable" },
      { status: 403, headers },
    );
  }
  const db = ctx.env.DB;
  const viewer = await db
    .prepare(`SELECT id FROM users u WHERE u.id = ? AND ${registered}`)
    .bind(ctx.data.userId)
    .first();
  if (!viewer)
    return Response.json(
      { error: "sharing_unavailable" },
      { status: 403, headers },
    );
  const groups = (
    await db
      .prepare(
        `SELECT g.id,g.name FROM sharing_groups g JOIN sharing_group_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at,g.id`,
      )
      .bind(ctx.data.userId)
      .all<{ id: string; name: string }>()
  ).results;
  const requested = new URL(ctx.request.url).searchParams.get("group");
  const groupId = requested || groups[0]?.id || null;
  if (groupId && !groups.some((g) => g.id === groupId))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  if (!groupId)
    return Response.json(
      {
        userId: ctx.data.userId,
        groups,
        groupId: null,
        members: [],
        plans: [],
        movies: [],
        titles: [],
      },
      { headers },
    );
  const scope = `${registered} AND EXISTS (SELECT 1 FROM sharing_group_members gm WHERE gm.user_id=u.id AND gm.group_id=?)`;
  // Whitelist fields: no home location, calendar tokens, private notes or credentials.
  const members = await db
    .prepare(
      `SELECT u.id AS userId, u.email, p.display_name, p.bio, p.avatar_version FROM users u LEFT JOIN member_profiles p ON p.user_id=u.id WHERE ${scope} ORDER BY COALESCE(NULLIF(p.display_name, ''), u.email), u.id`,
    )
    .bind(groupId)
    .all<{
      userId: string;
      email: string;
      display_name: string | null;
      bio: string | null;
      avatar_version: string | null;
    }>();
  const plans = await db
    .prepare(
      `SELECT p.user_id AS userId, p.showing_id AS showingId, p.title, p.cinema_name AS cinemaName, p.starts_at AS startsAt, p.ends_at AS endsAt, (p.reserved_at IS NOT NULL) AS reserved
    FROM viewing_plans p JOIN users u ON u.id = p.user_id WHERE ${scope} AND datetime(p.starts_at) > CURRENT_TIMESTAMP ORDER BY p.starts_at, p.showing_id, p.user_id`,
    )
    .bind(groupId)
    .all<Omit<SharedPlan, "reserved"> & { reserved: number }>();
  const movies = await db
    .prepare(
      `SELECT p.user_id AS userId, p.movie_key AS movieKey, p.title, p.image_url AS imageUrl, p.status, p.comment
    FROM movie_preferences p JOIN users u ON u.id = p.user_id WHERE ${scope} AND p.starred = 1 AND (p.status IS NULL OR p.status = 'watched') ORDER BY p.title, p.user_id`,
    )
    .bind(groupId)
    .all<SharedMovie>();
  // Only future screenings in the same seven-day window as the movie detail page.
  const [through] = jstDateBounds(addDays(todayInJst(), 7));
  const upcoming = await db
    .prepare(
      `SELECT s.title, MIN(s.starts_at) AS nextShowingAt
    FROM showings s JOIN cinemas c ON c.id=s.cinema_id
    WHERE s.starts_at>=? AND s.starts_at<? AND datetime(s.starts_at)>datetime(?) AND c.approval!='disabled'
    AND (c.active_until IS NULL OR c.active_until>=date(s.starts_at,'+9 hours')) GROUP BY s.title`,
    )
    .bind(new Date().toISOString(), through, new Date().toISOString())
    .all<{ title: string; nextShowingAt: string }>();
  const nextByMovie = new Map<string, string>();
  for (const row of upcoming.results) {
    const key = moviePreferenceKey(row.title),
      previous = nextByMovie.get(key);
    if (!previous || row.nextShowingAt < previous)
      nextByMovie.set(key, row.nextShowingAt);
  }
  const currentMovies = movies.results.flatMap((movie) => {
    const nextShowingAt = nextByMovie.get(moviePreferenceKey(movie.title));
    return nextShowingAt ? [{ ...movie, nextShowingAt }] : [];
  });
  const titles = await db
    .prepare(
      `SELECT japanese_title AS japaneseTitle, english_title AS englishTitle FROM movie_title_research WHERE status = 'verified'`,
    )
    .all<{ japaneseTitle: string; englishTitle: string | null }>();
  const result: SharingResponse = {
    userId: ctx.data.userId,
    groups,
    groupId,
    members: members.results.map(
      (m): SharedMember => ({
        userId: m.userId,
        name: profileName(m.display_name, m.email),
        bio: m.bio ?? "",
        avatarUrl: avatarUrl(m.userId, m.avatar_version),
      }),
    ),
    plans: plans.results.map((p) => ({ ...p, reserved: !!p.reserved })),
    movies: currentMovies,
    titles: titles.results,
  };
  return Response.json(result, { headers });
};

export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (ctx) => {
  if (
    ctx.env.PUBLIC_MODE === "true" ||
    ctx.data.authUser?.status !== "active" ||
    ctx.request.headers.get("origin") !== new URL(ctx.request.url).origin
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  let body: { groupId?: unknown; name?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body.groupId !== "string" ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 100
  )
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers },
    );
  const result = await ctx.env.DB.prepare(
    `UPDATE sharing_groups SET name=? WHERE id=? AND EXISTS(SELECT 1 FROM sharing_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=sharing_groups.id AND m.user_id=? AND u.status='active' AND u.email IS NOT NULL)`,
  )
    .bind(body.name.trim(), body.groupId, ctx.data.userId)
    .run();
  return Response.json(
    { ok: result.meta.changes === 1 },
    { status: result.meta.changes === 1 ? 200 : 403, headers },
  );
};
