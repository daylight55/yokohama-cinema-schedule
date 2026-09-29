CREATE TABLE sharing_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL
);
CREATE TABLE sharing_group_members (
  group_id TEXT NOT NULL REFERENCES sharing_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX sharing_members_user ON sharing_group_members(user_id, group_id);
ALTER TABLE signup_invites ADD COLUMN group_id TEXT REFERENCES sharing_groups(id) ON DELETE CASCADE;

-- Historical invitations only: never infer relationships between unrelated users.
INSERT INTO sharing_groups(id, name, created_at)
SELECT 'invite:' || i.id,
  substr(COALESCE(NULLIF(a.display_name,''), substr(u.email,1,instr(u.email,'@')-1), 'Movie fan'),1,40) || ' & ' ||
  substr(COALESCE(NULLIF(b.display_name,''), substr(v.email,1,instr(v.email,'@')-1), 'Movie fan'),1,40), i.accepted_at
FROM signup_invites i JOIN users u ON u.id=i.invited_by JOIN users v ON v.id=i.accepted_by
LEFT JOIN member_profiles a ON a.user_id=u.id LEFT JOIN member_profiles b ON b.user_id=v.id
WHERE i.accepted_at IS NOT NULL AND u.id<>v.id AND u.email IS NOT NULL AND v.email IS NOT NULL;
INSERT INTO sharing_group_members SELECT g.id,i.invited_by FROM sharing_groups g JOIN signup_invites i ON g.id='invite:'||i.id;
INSERT INTO sharing_group_members SELECT g.id,i.accepted_by FROM sharing_groups g JOIN signup_invites i ON g.id='invite:'||i.id;

-- Consumption and membership changes happen in the same D1 transaction.
CREATE TRIGGER invitation_sharing AFTER UPDATE OF accepted_at ON signup_invites
WHEN OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL AND NEW.accepted_by<>NEW.invited_by
BEGIN
  INSERT INTO sharing_groups(id,name,created_at)
  SELECT 'invite:'||NEW.id,
    substr(COALESCE(NULLIF(a.display_name,''), substr(u.email,1,instr(u.email,'@')-1), 'Movie fan'),1,40) || ' & ' ||
    substr(COALESCE(NULLIF(b.display_name,''), substr(v.email,1,instr(v.email,'@')-1), 'Movie fan'),1,40), NEW.accepted_at
  FROM users u JOIN users v ON v.id=NEW.accepted_by
  LEFT JOIN member_profiles a ON a.user_id=u.id LEFT JOIN member_profiles b ON b.user_id=v.id
  WHERE u.id=NEW.invited_by AND NEW.group_id IS NULL;
  INSERT OR IGNORE INTO sharing_group_members VALUES(COALESCE(NEW.group_id,'invite:'||NEW.id),NEW.invited_by);
  INSERT OR IGNORE INTO sharing_group_members VALUES(COALESCE(NEW.group_id,'invite:'||NEW.id),NEW.accepted_by);
END;
CREATE TRIGGER cleanup_empty_sharing_groups AFTER DELETE ON sharing_group_members
BEGIN
  DELETE FROM sharing_groups WHERE id=OLD.group_id AND NOT EXISTS(SELECT 1 FROM sharing_group_members WHERE group_id=OLD.group_id);
END;
