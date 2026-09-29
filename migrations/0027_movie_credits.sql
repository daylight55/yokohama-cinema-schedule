CREATE TABLE movie_credits (
  title_key TEXT PRIMARY KEY REFERENCES movie_title_research(title_key),
  credits_json TEXT CHECK (credits_json IS NULL OR json_valid(credits_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'unresolved')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX movie_credits_pending ON movie_credits(status, next_attempt_at);
