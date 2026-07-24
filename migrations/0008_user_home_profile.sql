CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  home_latitude REAL NOT NULL CHECK (home_latitude BETWEEN -90 AND 90),
  home_longitude REAL NOT NULL CHECK (home_longitude BETWEEN -180 AND 180),
  home_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_home_station_access (
  station_id TEXT PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
  walk_minutes INTEGER NOT NULL CHECK (walk_minutes > 0),
  distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
  provider TEXT NOT NULL CHECK (provider IN ('google_maps', 'estimate')),
  calculated_at TEXT NOT NULL
);

DELETE FROM app_preferences
WHERE preference_key = 'location_auto_enabled';
