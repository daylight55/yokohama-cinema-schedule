CREATE TABLE account_withdrawal_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delete_after TEXT NOT NULL,
  language TEXT NOT NULL,
  created_at TEXT NOT NULL,
  next_attempt_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  sent_at TEXT
);
CREATE INDEX account_withdrawal_emails_pending ON account_withdrawal_emails(sent_at, next_attempt_at);
