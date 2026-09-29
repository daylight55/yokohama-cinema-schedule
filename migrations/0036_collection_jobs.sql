CREATE TABLE collection_jobs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('scheduled','admin','operator')),
  requested_by TEXT,
  batch INTEGER NOT NULL CHECK(batch BETWEEN 0 AND 2),
  source_ids TEXT NOT NULL,
  dates TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','partial','failed','interrupted','skipped')),
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  result_json TEXT,
  error_message TEXT
);
CREATE INDEX idx_collection_jobs_recent ON collection_jobs(requested_at DESC);
CREATE INDEX idx_collection_jobs_queue ON collection_jobs(state, requested_at);
-- Admin jobs target exactly one cinema and one day. No duplicate queued/running request.
CREATE UNIQUE INDEX idx_collection_jobs_active_admin
  ON collection_jobs(source_ids, dates) WHERE trigger_kind='admin' AND state IN ('queued','running');
CREATE TABLE collection_execution_lock (
  id INTEGER PRIMARY KEY CHECK(id=1),
  owner TEXT,
  expires_at TEXT NOT NULL
);
INSERT INTO collection_execution_lock VALUES (1, NULL, '1970-01-01T00:00:00.000Z');
