CREATE TABLE IF NOT EXISTS movie_marathon_plans (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL,
  available_start TEXT NOT NULL,
  available_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'planned')),
  google_calendar_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movie_marathon_plans_date
  ON movie_marathon_plans(plan_date DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS movie_marathon_plan_showings (
  plan_id TEXT NOT NULL REFERENCES movie_marathon_plans(id) ON DELETE CASCADE,
  showing_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  cinema_id TEXT NOT NULL,
  cinema_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  booking_url TEXT NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  transfer_minutes INTEGER NOT NULL CHECK (transfer_minutes >= 0),
  PRIMARY KEY (plan_id, sequence)
);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
