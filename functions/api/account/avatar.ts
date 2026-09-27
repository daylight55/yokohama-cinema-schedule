import { registeredProfileUser } from "../../_lib/member-profile";
import type { AuthContextData, PagesEnv } from "../../_lib/env";
export const onRequestGet: PagesFunction<
  PagesEnv,
  string,
  AuthContextData
> = async ({ env, data, request }) => {
  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
  };
  if (!(await registeredProfileUser(env, data)))
    return new Response(null, { status: 403, headers });
  const userId = new URL(request.url).searchParams.get("userId") || data.userId;
  const row = await env.DB.prepare(
    `SELECT p.avatar, p.avatar_type FROM member_profiles p JOIN users u ON u.id=p.user_id
    WHERE u.id=? AND u.status='active' AND u.email IS NOT NULL AND p.avatar IS NOT NULL`,
  )
    .bind(userId)
    .first<{ avatar: ArrayBuffer | number[]; avatar_type: string }>();
  if (!row) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(row.avatar), {
    headers: { ...headers, "content-type": row.avatar_type },
  });
};
