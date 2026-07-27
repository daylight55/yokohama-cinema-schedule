ALTER TABLE movie_preferences
ADD COLUMN status TEXT
  CHECK (status IN ('watched', 'not_interested') OR status IS NULL);

CREATE INDEX IF NOT EXISTS idx_movie_preferences_status
ON movie_preferences(status, updated_at DESC);
