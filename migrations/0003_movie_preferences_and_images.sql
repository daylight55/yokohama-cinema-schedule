ALTER TABLE showings ADD COLUMN image_url TEXT;

CREATE TABLE IF NOT EXISTS movie_preferences (
  movie_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT,
  starred INTEGER NOT NULL DEFAULT 1
    CHECK (starred IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movie_preferences_starred
  ON movie_preferences(starred, updated_at DESC);
