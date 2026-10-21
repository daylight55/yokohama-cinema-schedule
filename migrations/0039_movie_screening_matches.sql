-- Screening decisions never change the official source ID/title evidence.
CREATE TABLE movie_screening_matches (
  source_id TEXT NOT NULL,
  source_movie_id TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  policy TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('matched','held')),
  reason TEXT,
  model TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  retry_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (source_id,source_movie_id,evidence_hash,policy)
);
