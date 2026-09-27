CREATE TABLE member_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '' CHECK(length(display_name) <= 40),
  bio TEXT NOT NULL DEFAULT '' CHECK(length(bio) <= 160),
  avatar BLOB,
  avatar_type TEXT,
  avatar_version TEXT,
  updated_at TEXT NOT NULL,
  CHECK (avatar IS NULL OR length(avatar) <= 131072)
);
