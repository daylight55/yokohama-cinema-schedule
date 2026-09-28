-- Keep source identity/evidence before the application movie key is generated.
ALTER TABLE showings ADD COLUMN source_movie_id TEXT;
ALTER TABLE showings ADD COLUMN source_title TEXT;
CREATE TABLE source_movie_identity (
  source_id TEXT NOT NULL,
  source_movie_id TEXT NOT NULL,
  observed_title TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  verification TEXT NOT NULL CHECK (verification IN ('official','observed')),
  evidence_url TEXT,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (source_id,source_movie_id)
);
CREATE TABLE movie_ingestion_issues (
  source_id TEXT NOT NULL,
  source_movie_id TEXT NOT NULL,
  observed_title TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  PRIMARY KEY (source_id,source_movie_id,observed_title)
);
CREATE INDEX movie_ingestion_issues_open ON movie_ingestion_issues(resolved_at,last_seen_at);
