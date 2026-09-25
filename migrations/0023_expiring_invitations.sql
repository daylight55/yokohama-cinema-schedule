-- Only hashed bearer tokens are stored. Existing email allowlists no longer
-- authorize signup: administrators must issue a time-limited invitation.
CREATE TABLE signup_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users(id),
  revoked_at TEXT,
  CHECK (expires_at > created_at AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+1 day'))
);
CREATE INDEX signup_invites_created ON signup_invites(created_at DESC);
