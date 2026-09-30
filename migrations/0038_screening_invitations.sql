-- Invitations belong to the sender's plan and both current group memberships.
CREATE TABLE screening_invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  showing_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(sender_id <> recipient_id),
  UNIQUE(group_id,sender_id,recipient_id,showing_id),
  FOREIGN KEY(group_id,sender_id) REFERENCES sharing_group_members(group_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(group_id,recipient_id) REFERENCES sharing_group_members(group_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id,showing_id) REFERENCES viewing_plans(user_id,showing_id) ON DELETE CASCADE
);
CREATE INDEX screening_invitations_recipient ON screening_invitations(recipient_id,status);
-- Acceptance and plan creation are one atomic statement, preserving any existing reservation.
CREATE TRIGGER accept_screening_invitation AFTER UPDATE OF status ON screening_invitations
WHEN OLD.status='pending' AND NEW.status='accepted'
BEGIN
  INSERT OR IGNORE INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,ends_at,screen,format,booking_url,created_at,updated_at)
  SELECT NEW.recipient_id,p.showing_id,p.movie_key,p.title,p.cinema_id,p.cinema_name,p.cinema_short_name,p.starts_at,p.ends_at,p.screen,p.format,p.booking_url,NEW.updated_at,NEW.updated_at
  FROM viewing_plans p WHERE p.user_id=NEW.sender_id AND p.showing_id=NEW.showing_id;
END;
