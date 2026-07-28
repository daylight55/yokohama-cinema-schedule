ALTER TABLE cinemas ADD COLUMN street_view_latitude REAL;
ALTER TABLE cinemas ADD COLUMN street_view_longitude REAL;
ALTER TABLE cinemas ADD COLUMN street_view_heading REAL;
ALTER TABLE cinemas ADD COLUMN street_view_pitch REAL NOT NULL DEFAULT 0;
ALTER TABLE cinemas ADD COLUMN street_view_fov REAL NOT NULL DEFAULT 95;

UPDATE cinemas
SET
  street_view_latitude = latitude,
  street_view_longitude = longitude
WHERE street_view_latitude IS NULL OR street_view_longitude IS NULL;

CREATE TABLE IF NOT EXISTS source_date_health (
  source_id TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('published', 'not_published', 'error')),
  showing_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  PRIMARY KEY (source_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_source_date_health_date
  ON source_date_health(schedule_date, status);
