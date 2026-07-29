ALTER TABLE user_profiles
  ADD COLUMN departure_ciphertext TEXT;

ALTER TABLE user_profiles
  ADD COLUMN departure_iv TEXT;

ALTER TABLE user_profiles
  ADD COLUMN departure_salt TEXT;

ALTER TABLE user_profiles
  ADD COLUMN departure_encryption_version INTEGER
    CHECK (
      departure_encryption_version IS NULL
      OR departure_encryption_version > 0
    );
