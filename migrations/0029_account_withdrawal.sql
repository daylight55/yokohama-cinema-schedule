ALTER TABLE users ADD COLUMN withdrawn_at TEXT;
ALTER TABLE users ADD COLUMN delete_after TEXT;
CREATE INDEX users_deletion_due ON users(delete_after) WHERE withdrawn_at IS NOT NULL;

-- Most user-owned tables already cascade. Invitations also contain identifiers
-- and have non-cascading references; remove them atomically with their owner.
CREATE TRIGGER delete_user_invitations BEFORE DELETE ON users BEGIN
  DELETE FROM signup_invites WHERE invited_by=OLD.id OR accepted_by=OLD.id OR email=OLD.email;
  DELETE FROM user_invites WHERE email=OLD.email;
END;
