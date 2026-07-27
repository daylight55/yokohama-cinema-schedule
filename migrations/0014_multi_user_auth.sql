PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_email TEXT,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

INSERT OR IGNORE INTO users (
  id, email, display_email, role, status, created_at, updated_at
) VALUES (
  'legacy-local', NULL, NULL, 'admin', 'active',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_auth_identities (
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, provider_email)
);

CREATE TABLE IF NOT EXISTS user_password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK (iterations >= 100000),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry
  ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  device_type TEXT NOT NULL
    CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  transports TEXT NOT NULL DEFAULT '[]',
  aaguid TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user
  ON webauthn_credentials(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  challenge_type TEXT NOT NULL
    CHECK (challenge_type IN ('registration', 'authentication')),
  rp_id TEXT NOT NULL,
  expected_origin TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry
  ON webauthn_challenges(expires_at);

CREATE TABLE IF NOT EXISTS user_invites (
  email TEXT PRIMARY KEY,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  accepted_at TEXT
);

ALTER TABLE movie_preferences RENAME TO movie_preferences_single_user;
CREATE TABLE movie_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  starred INTEGER NOT NULL DEFAULT 1 CHECK (starred IN (0, 1)),
  updated_at TEXT NOT NULL,
  status TEXT CHECK (
    status IN ('watched', 'not_interested') OR status IS NULL
  ),
  PRIMARY KEY (user_id, movie_key)
);
INSERT INTO movie_preferences (
  user_id, movie_key, title, image_url, starred, updated_at, status
)
SELECT
  'legacy-local', movie_key, title, image_url, starred, updated_at, status
FROM movie_preferences_single_user;
DROP TABLE movie_preferences_single_user;
CREATE INDEX idx_movie_preferences_starred
  ON movie_preferences(user_id, starred, updated_at DESC);
CREATE INDEX idx_movie_preferences_status
  ON movie_preferences(user_id, status, updated_at DESC);

ALTER TABLE cinema_travel_preferences
  RENAME TO cinema_travel_preferences_single_user;
CREATE TABLE cinema_travel_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cinema_id TEXT NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  travel_mode TEXT NOT NULL DEFAULT 'transit'
    CHECK (travel_mode IN ('walking', 'transit', 'bus', 'bicycle')),
  updated_at TEXT NOT NULL,
  custom_duration_minutes INTEGER CHECK (
    custom_duration_minutes IS NULL OR
    custom_duration_minutes BETWEEN 1 AND 1440
  ),
  PRIMARY KEY (user_id, cinema_id)
);
INSERT INTO cinema_travel_preferences (
  user_id, cinema_id, travel_mode, updated_at, custom_duration_minutes
)
SELECT
  'legacy-local', cinema_id, travel_mode, updated_at,
  custom_duration_minutes
FROM cinema_travel_preferences_single_user;
DROP TABLE cinema_travel_preferences_single_user;

ALTER TABLE app_preferences RENAME TO app_preferences_single_user;
CREATE TABLE app_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, preference_key)
);
INSERT INTO app_preferences (
  user_id, preference_key, preference_value, updated_at
)
SELECT
  'legacy-local', preference_key, preference_value, updated_at
FROM app_preferences_single_user;
DROP TABLE app_preferences_single_user;

ALTER TABLE user_profiles RENAME TO user_profiles_single_user;
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_latitude REAL NOT NULL CHECK (home_latitude BETWEEN -90 AND 90),
  home_longitude REAL NOT NULL CHECK (home_longitude BETWEEN -180 AND 180),
  home_updated_at TEXT NOT NULL
);
INSERT INTO user_profiles (
  user_id, home_latitude, home_longitude, home_updated_at
)
SELECT
  'legacy-local', home_latitude, home_longitude, home_updated_at
FROM user_profiles_single_user;
DROP TABLE user_profiles_single_user;

ALTER TABLE user_home_station_access
  RENAME TO user_home_station_access_single_user;
CREATE TABLE user_home_station_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  walk_minutes INTEGER NOT NULL CHECK (walk_minutes > 0),
  distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
  provider TEXT NOT NULL CHECK (provider IN ('google_maps', 'estimate')),
  calculated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, station_id)
);
INSERT INTO user_home_station_access (
  user_id, station_id, walk_minutes, distance_meters, provider,
  calculated_at
)
SELECT
  'legacy-local', station_id, walk_minutes, distance_meters, provider,
  calculated_at
FROM user_home_station_access_single_user;
DROP TABLE user_home_station_access_single_user;

ALTER TABLE movie_marathon_plan_showings
  RENAME TO movie_marathon_plan_showings_single_user;
ALTER TABLE movie_marathon_plans
  RENAME TO movie_marathon_plans_single_user;
CREATE TABLE movie_marathon_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL,
  available_start TEXT NOT NULL,
  available_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'planned')),
  google_calendar_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO movie_marathon_plans (
  id, user_id, plan_date, available_start, available_end, status,
  google_calendar_event_id, created_at, updated_at
)
SELECT
  id, 'legacy-local', plan_date, available_start, available_end, status,
  google_calendar_event_id, created_at, updated_at
FROM movie_marathon_plans_single_user;
CREATE TABLE movie_marathon_plan_showings (
  plan_id TEXT NOT NULL REFERENCES movie_marathon_plans(id) ON DELETE CASCADE,
  showing_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  cinema_id TEXT NOT NULL,
  cinema_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  booking_url TEXT NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
  transfer_minutes INTEGER NOT NULL CHECK (transfer_minutes >= 0),
  PRIMARY KEY (plan_id, sequence)
);
INSERT INTO movie_marathon_plan_showings (
  plan_id, showing_id, sequence, movie_key, title, cinema_id, cinema_name,
  starts_at, ends_at, booking_url, starred, transfer_minutes
)
SELECT
  plan_id, showing_id, sequence, movie_key, title, cinema_id, cinema_name,
  starts_at, ends_at, booking_url, starred, transfer_minutes
FROM movie_marathon_plan_showings_single_user;
DROP TABLE movie_marathon_plan_showings_single_user;
DROP TABLE movie_marathon_plans_single_user;
CREATE INDEX idx_movie_marathon_plans_user_date
  ON movie_marathon_plans(user_id, plan_date, updated_at DESC);

ALTER TABLE google_calendar_connections
  RENAME TO google_calendar_connections_single_user;
CREATE TABLE google_calendar_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO google_calendar_connections (
  user_id, email, refresh_token_ciphertext, refresh_token_iv, scopes,
  created_at, updated_at
)
SELECT
  'legacy-local', email, refresh_token_ciphertext, refresh_token_iv, scopes,
  created_at, updated_at
FROM google_calendar_connections_single_user;
DROP TABLE google_calendar_connections_single_user;

PRAGMA foreign_keys = ON;
