CREATE TABLE IF NOT EXISTS app_preferences (
  preference_key TEXT PRIMARY KEY,
  preference_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
