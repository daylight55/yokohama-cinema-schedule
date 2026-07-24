export interface PagesEnv {
  DB: D1Database;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  SESSION_TTL_DAYS?: string;
  PUBLIC_MODE?: string;
  GOOGLE_MAPS_API_KEY?: string;
  ROUTE_MATRIX_API_URL?: string;
  ROUTE_MATRIX_API_KEY?: string;
}
