ALTER TABLE showings ADD COLUMN release_date TEXT;

CREATE TABLE IF NOT EXISTS movie_release_dates (
  title_key TEXT PRIMARY KEY,
  tmdb_movie_id INTEGER NOT NULL,
  tmdb_title TEXT NOT NULL,
  release_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movie_release_dates_fetched
  ON movie_release_dates(fetched_at DESC);
