-- Machine translations are display fallbacks, never evidence for film identity.
CREATE TABLE movie_title_translations (
  title_key TEXT PRIMARY KEY REFERENCES movie_title_research(title_key) ON DELETE CASCADE,
  english_title TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'translated', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX movie_title_translations_pending ON movie_title_translations(next_attempt_at);
