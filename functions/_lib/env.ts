export interface PagesEnv {
  DB: D1Database;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
  SESSION_TTL_DAYS?: string;
  PUBLIC_MODE?: string;
}
