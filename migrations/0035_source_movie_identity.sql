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
  next_check_at TEXT,
  PRIMARY KEY (source_id,source_movie_id,observed_title)
);
CREATE INDEX movie_ingestion_issues_open ON movie_ingestion_issues(resolved_at,last_seen_at);

-- Activate only after the new collector and verified catalog are deployed.
-- The DB contract survives a later accidental deployment of an older Worker.
CREATE TABLE movie_ingestion_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  require_source_identity INTEGER NOT NULL CHECK(require_source_identity IN (0,1))
);
INSERT INTO movie_ingestion_policy VALUES(1,0);
CREATE TRIGGER showings_require_source_identity
BEFORE INSERT ON showings
WHEN (SELECT require_source_identity FROM movie_ingestion_policy WHERE id=1)=1
AND (
  NEW.source_movie_id IS NULL OR NEW.source_title IS NULL OR length(NEW.source_title)=0
  OR NOT EXISTS (
    SELECT 1 FROM source_movie_identity
    WHERE source_id=NEW.source_id AND source_movie_id=NEW.source_movie_id
  )
  OR EXISTS (
    SELECT 1 FROM movie_ingestion_issues
    WHERE source_id=NEW.source_id AND source_movie_id=NEW.source_movie_id
      AND observed_title=NEW.source_title AND resolved_at IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT,'Movie source identity validation required; deploy the current collector');
END;
