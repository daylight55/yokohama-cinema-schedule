-- Keep each observed date outcome, including retries with unchanged results.
-- Triggers also cover the existing deployed collector and manual SQL imports.
CREATE TABLE source_date_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL CHECK (status IN ('published', 'not_published', 'error')),
  showing_count INTEGER NOT NULL,
  error_message TEXT
);
CREATE INDEX idx_source_date_history_lookup
  ON source_date_history(schedule_date, source_id, id DESC);

CREATE TRIGGER source_date_history_insert AFTER INSERT ON source_date_health
BEGIN
  INSERT INTO source_date_history
    (source_id, schedule_date, attempted_at, status, showing_count, error_message)
  VALUES (NEW.source_id, NEW.schedule_date, NEW.last_attempt_at,
          NEW.status, NEW.showing_count, NEW.error_message);
END;

CREATE TRIGGER source_date_history_update AFTER UPDATE ON source_date_health
BEGIN
  INSERT INTO source_date_history
    (source_id, schedule_date, attempted_at, status, showing_count, error_message)
  VALUES (NEW.source_id, NEW.schedule_date, NEW.last_attempt_at,
          NEW.status, NEW.showing_count, NEW.error_message);
END;
