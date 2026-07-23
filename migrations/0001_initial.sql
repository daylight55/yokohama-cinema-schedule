PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cinemas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  area TEXT NOT NULL,
  area_label TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  source_url TEXT NOT NULL,
  active_until TEXT,
  approval TEXT NOT NULL DEFAULT 'private_only'
    CHECK (approval IN ('private_only', 'approved', 'disabled')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS showings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  cinema_id TEXT NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  screen TEXT,
  format TEXT,
  booking_url TEXT NOT NULL,
  purchasable INTEGER,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_showings_date
  ON showings(starts_at, cinema_id);
CREATE INDEX IF NOT EXISTS idx_showings_source
  ON showings(source_id, starts_at);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  showing_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_fetch_runs_source
  ON fetch_runs(source_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  source_id TEXT PRIMARY KEY,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'error')),
  showing_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
