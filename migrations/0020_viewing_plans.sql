PRAGMA foreign_keys = ON;

CREATE TABLE viewing_plans (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  showing_id TEXT NOT NULL,
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  cinema_id TEXT NOT NULL,
  cinema_name TEXT NOT NULL,
  cinema_short_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  screen TEXT,
  format TEXT,
  booking_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, showing_id)
);

CREATE INDEX idx_viewing_plans_user_start
  ON viewing_plans(user_id, starts_at);
