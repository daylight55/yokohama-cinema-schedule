-- A preferred group must be one the user still belongs to.
CREATE TABLE sharing_preferences (
  user_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  FOREIGN KEY (group_id,user_id) REFERENCES sharing_group_members(group_id,user_id) ON DELETE CASCADE
);
CREATE TABLE group_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  movie_key TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('starred','watched','comment')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (group_id,actor_id) REFERENCES sharing_group_members(group_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id,movie_key) REFERENCES movie_preferences(user_id,movie_key) ON DELETE CASCADE
);
CREATE INDEX group_activity_created ON group_activity(created_at);
-- Record the audience at event time. Later joiners do not receive old notifications.
CREATE TABLE activity_recipients (
  event_id INTEGER NOT NULL REFERENCES group_activity(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id),
  FOREIGN KEY(group_id,user_id) REFERENCES sharing_group_members(group_id,user_id) ON DELETE CASCADE
);
CREATE INDEX activity_recipient_user ON activity_recipients(user_id,event_id);
CREATE TABLE notification_reads (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER group_activity_audience AFTER INSERT ON group_activity
BEGIN
  INSERT INTO activity_recipients(event_id,group_id,user_id)
  SELECT NEW.id,NEW.group_id,m.user_id FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.group_id=NEW.group_id AND m.user_id<>NEW.actor_id AND u.status='active' AND u.email IS NOT NULL;
END;
-- Separate conditional INSERTs avoid Wrangler splitting CASE END inside triggers.
CREATE TRIGGER preference_activity_insert AFTER INSERT ON movie_preferences
BEGIN
  INSERT INTO group_activity(group_id,actor_id,movie_key,title,kind)
  SELECT m.group_id,NEW.user_id,NEW.movie_key,NEW.title,'watched'
  FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.user_id=NEW.user_id AND u.status='active' AND u.email IS NOT NULL AND NEW.status='watched';
  INSERT INTO group_activity(group_id,actor_id,movie_key,title,kind)
  SELECT m.group_id,NEW.user_id,NEW.movie_key,NEW.title,'starred'
  FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.user_id=NEW.user_id AND u.status='active' AND u.email IS NOT NULL AND NEW.starred=1 AND NEW.status IS NOT 'watched' AND NEW.status IS NOT 'not_interested';
END;
CREATE TRIGGER preference_activity_update AFTER UPDATE ON movie_preferences
BEGIN
  INSERT INTO group_activity(group_id,actor_id,movie_key,title,kind)
  SELECT m.group_id,NEW.user_id,NEW.movie_key,NEW.title,'watched'
  FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.user_id=NEW.user_id AND u.status='active' AND u.email IS NOT NULL AND NEW.status='watched' AND OLD.status IS NOT 'watched';
  INSERT INTO group_activity(group_id,actor_id,movie_key,title,kind)
  SELECT m.group_id,NEW.user_id,NEW.movie_key,NEW.title,'starred'
  FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.user_id=NEW.user_id AND u.status='active' AND u.email IS NOT NULL AND NEW.starred=1 AND OLD.starred=0 AND NEW.status IS NOT 'not_interested' AND NOT (NEW.status IS 'watched' AND OLD.status IS NOT 'watched');
  INSERT INTO group_activity(group_id,actor_id,movie_key,title,kind)
  SELECT m.group_id,NEW.user_id,NEW.movie_key,NEW.title,'comment'
  FROM sharing_group_members m JOIN users u ON u.id=m.user_id
  WHERE m.user_id=NEW.user_id AND u.status='active' AND u.email IS NOT NULL AND NEW.starred=1 AND OLD.starred=1 AND NEW.status IS NOT 'not_interested' AND NEW.comment<>OLD.comment AND NEW.comment<>'' AND NOT (NEW.status IS 'watched' AND OLD.status IS NOT 'watched');
END;
-- A departed inviter's unused links must not become valid again after rejoining.
CREATE TRIGGER revoke_departed_member_invites AFTER DELETE ON sharing_group_members
BEGIN
  UPDATE signup_invites SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE group_id=OLD.group_id AND invited_by=OLD.user_id AND accepted_at IS NULL AND revoked_at IS NULL;
END;
