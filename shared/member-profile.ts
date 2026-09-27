export interface MemberProfile {
  userId: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
}
export const PROFILE_NAME_LIMIT = 40;
export const PROFILE_BIO_LIMIT = 160;
export const AVATAR_MAX_BYTES = 128 * 1024;
export function avatarUrl(
  userId: string,
  version: string | null,
): string | null {
  return version
    ? `/api/account/avatar?userId=${encodeURIComponent(userId)}&v=${encodeURIComponent(version)}`
    : null;
}
export function profileName(name: string | null, email: string | null): string {
  return name || email?.split("@")[0] || "Movie fan";
}
