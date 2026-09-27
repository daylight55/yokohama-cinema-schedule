ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'ja' CHECK (language IN ('ja', 'en'));
CREATE TABLE movie_title_research (
  title_key TEXT PRIMARY KEY,
  japanese_title TEXT NOT NULL,
  original_title TEXT,
  english_title TEXT,
  source_url TEXT,
  entity_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'reference' CHECK (source_kind IN ('reference', 'official')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'unresolved')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX movie_title_research_pending ON movie_title_research(status, next_attempt_at);
