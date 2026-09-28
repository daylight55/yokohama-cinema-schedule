import { listMovieTitles } from "../_lib/movie-titles";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import { avatarUrl, profileName } from "../../shared/member-profile";
import type {
  GroupActivity,
  NotificationsResponse,
} from "../../shared/notifications";

const headers = { "cache-control": "private, no-store" };
// Both audience and author membership cascade on leaving; check active accounts again at read time.
const scope = `FROM activity_recipients r JOIN group_activity a ON a.id=r.event_id
 JOIN sharing_groups g ON g.id=a.group_id
 JOIN users u ON u.id=a.actor_id JOIN users viewer ON viewer.id=r.user_id
 JOIN movie_preferences p ON p.user_id=a.actor_id AND p.movie_key=a.movie_key
 LEFT JOIN member_profiles profile ON profile.user_id=u.id
 WHERE r.user_id=? AND u.status='active' AND viewer.status='active'
 AND u.email IS NOT NULL AND viewer.email IS NOT NULL
 AND a.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')
 AND p.status IS NOT 'not_interested'
 AND ((a.kind='watched' AND p.status='watched') OR (a.kind IN ('starred','comment') AND p.starred=1))`;
function allowed(ctx: Parameters<typeof onRequestGet>[0]) {
  return (
    ctx.env.PUBLIC_MODE !== "true" &&
    !!ctx.data.userId &&
    ctx.data.authUser?.status === "active"
  );
}
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (ctx) => {
  if (!allowed(ctx))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const summary = new URL(ctx.request.url).searchParams.get("summary") === "1";
  const limit = summary ? 5 : 50;
  const beforeParam = new URL(ctx.request.url).searchParams.get("before");
  const before =
    beforeParam === null ? Number.MAX_SAFE_INTEGER : Number(beforeParam);
  if (!Number.isSafeInteger(before) || before < 1)
    return Response.json({ error: "invalid_cursor" }, { status: 400, headers });
  const db = ctx.env.DB,
    userId = ctx.data.userId;
  const read = await db
    .prepare("SELECT last_read_id FROM notification_reads WHERE user_id=?")
    .bind(userId)
    .first<{ last_read_id: number }>();
  const lastReadId = read?.last_read_id ?? 0;
  const count = await db
    .prepare(
      `SELECT COUNT(CASE WHEN a.id>? THEN 1 END) unread, COALESCE(MAX(a.id),0) latestId ${scope}`,
    )
    .bind(lastReadId, userId)
    .first<{ unread: number; latestId: number }>();
  const rows = await db
    .prepare(
      `SELECT a.id,a.group_id groupId,g.name groupName,a.actor_id actorId,u.email,profile.display_name,profile.avatar_version,a.movie_key movieKey,a.title,a.kind,a.created_at createdAt, CASE WHEN p.starred=1 THEN p.comment ELSE '' END comment ${scope} AND a.id<? ORDER BY a.id DESC LIMIT ${limit + 1}`,
    )
    .bind(userId, before)
    .all<
      GroupActivity & {
        email: string;
        display_name: string | null;
        avatar_version: string | null;
      }
    >();
  const titles = summary ? [] : await listMovieTitles(db);
  const result: NotificationsResponse = {
    userId,
    unread: count?.unread ?? 0,
    latestId: count?.latestId ?? 0,
    lastReadId,
    nextBefore: rows.results.length > limit ? rows.results[limit - 1].id : null,
    items: rows.results
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        groupId: row.groupId,
        groupName: row.groupName,
        actorId: row.actorId,
        movieKey: row.movieKey,
        title: row.title,
        kind: row.kind,
        createdAt: row.createdAt,
        comment: row.comment,
        name: profileName(row.display_name, row.email),
        avatarUrl: avatarUrl(row.actorId, row.avatar_version),
      })),
    titles: titles.map(({japaneseTitle, englishTitle}) => ({japaneseTitle, englishTitle})),
  };
  return Response.json(result, { headers });
};
export const onRequestPatch: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async (ctx) => {
  if (
    !allowed(ctx) ||
    ctx.request.headers.get("origin") !== new URL(ctx.request.url).origin
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  let body: { through?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body.through !== "number" ||
    !Number.isSafeInteger(body.through) ||
    body.through < 0
  )
    return Response.json({ error: "invalid_cursor" }, { status: 400, headers });
  // Cap to events accessible to this user. A future/forged cursor cannot hide future updates.
  const max = await ctx.env.DB.prepare(
    `SELECT COALESCE(MAX(a.id),0) id ${scope}`,
  )
    .bind(ctx.data.userId)
    .first<{ id: number }>();
  await ctx.env.DB.prepare(
    `INSERT INTO notification_reads(user_id,last_read_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_read_id=MAX(notification_reads.last_read_id,excluded.last_read_id)`,
  )
    .bind(ctx.data.userId, Math.min(body.through, max?.id ?? 0))
    .run();
  return Response.json({ ok: true }, { headers });
};
