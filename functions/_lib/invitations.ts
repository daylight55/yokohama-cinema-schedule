import type { Language } from "../../shared/language";
import { normalizeEmail, type AuthUser } from "./auth";
import type { GoogleIdentity } from "./accounts";

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export interface SignupInvite {
  id: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createInvite(
  db: D1Database,
  emailValue: string,
  invitedBy: string,
) {
  const email = emailValue.trim() ? normalizeEmail(emailValue) : null;
  if (emailValue.trim() && !email) throw new RangeError("invalid_email");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(createdAt) + INVITE_TTL_MS,
  ).toISOString();
  await db
    .prepare(
      `INSERT INTO signup_invites (id, token_hash, email, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      await hashInviteToken(token),
      email,
      invitedBy,
      createdAt,
      expiresAt,
    )
    .run();
  return { id, token, email, createdAt, expiresAt };
}
export async function findValidInvite(
  db: D1Database,
  token: string,
): Promise<SignupInvite | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT id, email, created_at, expires_at, accepted_at, revoked_at FROM signup_invites
    WHERE token_hash = ? AND expires_at > ? AND accepted_at IS NULL AND revoked_at IS NULL`,
    )
    .bind(await hashInviteToken(token), new Date().toISOString())
    .first<SignupInvite>();
}
export async function registerInvitedGoogleUser(
  db: D1Database,
  token: string,
  identity: GoogleIdentity,
  language: Language = "ja",
): Promise<AuthUser> {
  const email = normalizeEmail(identity.email);
  if (
    !email ||
    !identity.emailVerified ||
    !identity.subject ||
    identity.subject.length > 255
  )
    throw new Error("google_identity_not_verified");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("invite_required");
  const tokenHash = await hashInviteToken(token);
  const now = new Date().toISOString();
  const id = `user_${crypto.randomUUID()}`;
  // D1 batch is transactional. The conditional INSERT is the consumption gate:
  // concurrent requests, revocation and expiry cannot create a second account.
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, email, display_email, role, status, created_at, updated_at, last_login_at, language)
      SELECT ?, ?, ?, 'member', 'active', ?, ?, ?, ? FROM signup_invites
      WHERE token_hash = ? AND expires_at > ? AND accepted_at IS NULL AND revoked_at IS NULL AND (email IS NULL OR email = ?)`,
      )
      .bind(
        id,
        email,
        identity.email,
        now,
        now,
        now,
        language,
        tokenHash,
        now,
        email,
      ),
    db
      .prepare(
        `INSERT INTO user_auth_identities (provider, provider_subject, user_id, provider_email, created_at, updated_at)
      SELECT 'google', ?, id, ?, ?, ? FROM users WHERE id = ?`,
      )
      .bind(identity.subject, email, now, now, id),
    db
      .prepare(
        `UPDATE signup_invites SET accepted_at = ?, accepted_by = ? WHERE token_hash = ?
      AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      )
      .bind(now, id, tokenHash, id),
  ]);
  if (results[0].meta.changes !== 1) throw new Error("invite_required");
  return {
    id,
    email,
    displayEmail: identity.email,
    role: "member",
    status: "active",
  };
}
