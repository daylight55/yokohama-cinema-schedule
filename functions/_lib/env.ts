export interface PagesEnv {
  DB: D1Database;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  GOOGLE_MAPS_API_KEY?: string;
  SESSION_TTL_DAYS?: string;
  PUBLIC_MODE?: string;
}
