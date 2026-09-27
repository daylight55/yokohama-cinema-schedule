ALTER TABLE movie_synopses ADD COLUMN generation_method TEXT NOT NULL DEFAULT 'reviewed' CHECK(generation_method IN ('reviewed','workers_ai'));
ALTER TABLE movie_synopses ADD COLUMN model_name TEXT;
CREATE TABLE synopsis_research (
  title_key TEXT PRIMARY KEY REFERENCES movie_title_research(title_key),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  next_attempt_at TEXT NOT NULL,
  last_reason TEXT
);
CREATE TABLE synopsis_research_gate (id INTEGER PRIMARY KEY CHECK(id=1), next_attempt_at TEXT NOT NULL);
INSERT INTO synopsis_research_gate VALUES(1,'1970-01-01T00:00:00.000Z');
