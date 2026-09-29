import {
  avatarUrl,
  profileName,
  type MemberProfile,
} from "../../shared/member-profile";
import type { AuthContextData, PagesEnv } from "./env";
export async function registeredProfileUser(
  env: PagesEnv,
  data: AuthContextData,
): Promise<boolean> {
  if (
    env.PUBLIC_MODE === "true" ||
    !data.userId ||
    data.authUser?.status !== "active"
  )
    return false;
  return Boolean(
    await env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND status = 'active' AND email IS NOT NULL",
    )
      .bind(data.userId)
      .first(),
  );
}
export async function getMemberProfile(
  db: D1Database,
  userId: string,
): Promise<MemberProfile | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, p.display_name, p.bio, p.avatar_version
    FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status = 'active'`,
    )
    .bind(userId)
    .first<{
      id: string;
      email: string | null;
      display_name: string | null;
      bio: string | null;
      avatar_version: string | null;
    }>();
  return row
    ? {
        userId: row.id,
        displayName: profileName(row.display_name, row.email),
        bio: row.bio ?? "",
        avatarUrl: avatarUrl(row.id, row.avatar_version),
      }
    : null;
}
