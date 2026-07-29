export interface PagesEnv {
  DB: D1Database;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
  PROFILE_ENCRYPTION_KEY?: string;
  SESSION_TTL_DAYS?: string;
  PUBLIC_MODE?: string;
}

export function requireProfileEncryptionKey(env: PagesEnv): string {
  const key = env.PROFILE_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error("profile_encryption_key_unavailable");
  return key;
}

export interface AuthContextData extends Record<string, unknown> {
  userId: string;
  authUser: import("./auth").AuthUser;
  legacySession: boolean;
}
