import {
  registeredProfileUser,
  getMemberProfile,
} from "../_lib/member-profile";
import { listMovieTitles } from "../_lib/movie-titles";
import type { AuthContextData, PagesEnv } from "../_lib/env";
import type { MemberMovie, MemberPageResponse } from "../../shared/member-page";
import type { SharedPlan } from "../../shared/sharing";

const headers = { "cache-control": "private, no-store" };
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async ({ env, data, request }) => {
  if (!(await registeredProfileUser(env, data)))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const userId = new URL(request.url).searchParams.get("userId") || data.userId;
  if (userId.length > 128)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  // A shared group grants access to this member's movie activity, never account settings.
  const allowed = await env.DB.prepare(
    `SELECT u.id FROM users u
    WHERE u.id=? AND u.status='active' AND u.email IS NOT NULL
    AND (u.id=? OR EXISTS (
      SELECT 1 FROM sharing_group_members target JOIN sharing_group_members viewer ON viewer.group_id=target.group_id
      WHERE target.user_id=u.id AND viewer.user_id=?))`,
  )
    .bind(userId, data.userId, data.userId)
    .first();
  if (!allowed)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  const profile = await getMemberProfile(env.DB, userId);
  if (!profile)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  // Include past/unscheduled films and watched films even without a star.
  // Do not expose hidden films, private notes, addresses, or account credentials.
  const movies = await env.DB.prepare(
    `SELECT movie_key AS movieKey,title,image_url AS imageUrl,status,starred
    FROM movie_preferences WHERE user_id=? AND (status='watched' OR (starred=1 AND status IS NULL))
    ORDER BY updated_at DESC,movie_key`,
  )
    .bind(userId)
    .all<Omit<MemberMovie, "starred"> & { starred: number }>();
  const plans = await env.DB.prepare(
    `SELECT user_id AS userId,showing_id AS showingId,title,cinema_name AS cinemaName,
    starts_at AS startsAt,ends_at AS endsAt,(reserved_at IS NOT NULL) AS reserved
    FROM viewing_plans WHERE user_id=? AND datetime(starts_at)>CURRENT_TIMESTAMP ORDER BY starts_at,showing_id`,
  )
    .bind(userId)
    .all<Omit<SharedPlan, "reserved"> & { reserved: number }>();
  const titles = await listMovieTitles(env.DB);
  const result: MemberPageResponse = {
    profile,
    isSelf: userId === data.userId,
    movies: movies.results.map((m) => ({ ...m, starred: !!m.starred })),
    plans: plans.results.map((p) => ({ ...p, reserved: !!p.reserved })),
    titles: titles.map(({ japaneseTitle, englishTitle }) => ({
      japaneseTitle,
      englishTitle,
    })),
  };
  return Response.json(result, { headers });
};
