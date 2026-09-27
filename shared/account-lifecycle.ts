import type { D1Database } from "@cloudflare/workers-types";

/** A calendar month in Japan, clamped to the last day of the following month. */
export function accountDeletionDeadline(now: Date): string {
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 1);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, last));
  return new Date(local.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

/** Credential checks may proceed for a recoverable withdrawal, never an admin suspension. */
export async function accountCanLogin(db: D1Database, userId: string, now = new Date().toISOString()): Promise<boolean> {
  return !!await db.prepare(`SELECT id FROM users WHERE id=? AND
    ((status='active' AND withdrawn_at IS NULL) OR
     (status='disabled' AND withdrawn_at IS NOT NULL AND delete_after>?))`)
    .bind(userId, now).first();
}

export async function withdrawAccount(db: D1Database, userId: string, now = new Date()): Promise<string | null> {
  const deadline = accountDeletionDeadline(now);
  const results = await db.batch([
    db.prepare(`UPDATE users SET status='disabled', withdrawn_at=?, delete_after=?, updated_at=?
      WHERE id=? AND email IS NOT NULL AND status='active' AND withdrawn_at IS NULL`)
      .bind(now.toISOString(), deadline, now.toISOString(), userId),
    db.prepare(`DELETE FROM user_sessions WHERE user_id=? AND EXISTS
      (SELECT 1 FROM users WHERE id=? AND withdrawn_at IS NOT NULL)`).bind(userId, userId),
    db.prepare(`DELETE FROM webauthn_challenges WHERE user_id=? AND EXISTS
      (SELECT 1 FROM users WHERE id=? AND withdrawn_at IS NOT NULL)`).bind(userId, userId),
    db.prepare(`UPDATE signup_invites SET revoked_at=? WHERE invited_by=? AND accepted_at IS NULL
      AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id=? AND withdrawn_at IS NOT NULL)`)
      .bind(now.toISOString(), userId, userId),
  ]);
  return results[0].meta.changes === 1 ? deadline : null;
}

/** Single SQL statement: restore-vs-delete races resolve inside D1, never from a stale ID list. */
export async function purgeExpiredAccounts(db: D1Database, now = new Date().toISOString()): Promise<number> {
  const result = await db.prepare(`DELETE FROM users WHERE id IN (
    SELECT id FROM users WHERE withdrawn_at IS NOT NULL AND delete_after<=? AND status='disabled'
    ORDER BY delete_after LIMIT 100) AND withdrawn_at IS NOT NULL AND delete_after<=? AND status='disabled'`)
    .bind(now, now).run();
  return result.meta.changes ?? 0;
}
