CREATE TABLE IF NOT EXISTS cinema_travel_preferences (
  cinema_id TEXT PRIMARY KEY REFERENCES cinemas(id) ON DELETE CASCADE,
  travel_mode TEXT NOT NULL DEFAULT 'transit'
    CHECK (travel_mode IN ('walking', 'transit', 'bus', 'bicycle')),
  updated_at TEXT NOT NULL
);
