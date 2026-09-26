import type { AuthContextData, PagesEnv } from "../_lib/env";
import type {
  SharingResponse,
  SharedMember,
  SharedPlan,
  SharedMovie,
} from "../../shared/sharing";

const headers = { "cache-control": "private, no-store" };
// The site is invitation-only. All active registered accounts share this space;
// disabled accounts and the unclaimed legacy bootstrap account are excluded.
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
  // Whitelist fields: no home location, calendar tokens, private notes or credentials.
  const members = await db
    .prepare(
      `SELECT u.id AS userId, COALESCE(u.display_email, u.email) AS name FROM users u WHERE ${registered} ORDER BY name, u.id`,
    )
    .all<SharedMember>();
  const plans = await db
    .prepare(
      `SELECT p.user_id AS userId, p.showing_id AS showingId, p.title, p.cinema_name AS cinemaName, p.starts_at AS startsAt, p.ends_at AS endsAt, (p.reserved_at IS NOT NULL) AS reserved
    FROM viewing_plans p JOIN users u ON u.id = p.user_id WHERE ${registered} AND datetime(p.starts_at) > CURRENT_TIMESTAMP ORDER BY p.starts_at, p.showing_id, p.user_id`,
    )
    .all<Omit<SharedPlan, "reserved"> & { reserved: number }>();
  const movies = await db
    .prepare(
      `SELECT p.user_id AS userId, p.movie_key AS movieKey, p.title, p.image_url AS imageUrl
    FROM movie_preferences p JOIN users u ON u.id = p.user_id WHERE ${registered} AND p.starred = 1 ORDER BY p.title, p.user_id`,
    )
    .all<SharedMovie>();
  const titles = await db
    .prepare(
      `SELECT japanese_title AS japaneseTitle, english_title AS englishTitle FROM movie_title_research WHERE status = 'verified'`,
    )
    .all<{ japaneseTitle: string; englishTitle: string | null }>();
  const result: SharingResponse = {
    userId: ctx.data.userId,
    members: members.results,
    plans: plans.results.map((p) => ({ ...p, reserved: !!p.reserved })),
    movies: movies.results,
    titles: titles.results,
  };
  return Response.json(result, { headers });
};
