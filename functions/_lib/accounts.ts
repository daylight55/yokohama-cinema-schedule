import type { AuthUser, ResolvedSession } from "./auth";
import { findUserByEmail, LEGACY_USER_ID, normalizeEmail } from "./auth";
import { prepareDepartureLocationTransfer } from "./user-profile";

interface IdentityRow {
  user_id: string;
  email: string | null;
  display_email: string | null;
  role: AuthUser["role"];
  status: AuthUser["status"];
}
interface CountRow {
  count: number;
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

function mapIdentityUser(row: IdentityRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    displayEmail: row.display_email,
    role: row.role,
    status: row.status,
  };
}

async function findGoogleIdentity(
  db: D1Database,
  subject: string,
): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT i.user_id, u.email, u.display_email, u.role, u.status
         FROM user_auth_identities i
         JOIN users u ON u.id = i.user_id
        WHERE i.provider = 'google'
          AND i.provider_subject = ?`,
    )
    .bind(subject)
    .first<IdentityRow>();
  return row ? mapIdentityUser(row) : null;
}

async function hasAcceptedInvite(
  db: D1Database,
  email: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT email
         FROM user_invites
        WHERE email = ?
          AND accepted_at IS NULL`,
    )
    .bind(email)
    .first<{ email: string }>();
  return Boolean(row);
}

async function realUserCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE id != ?")
    .bind(LEGACY_USER_ID)
    .first<CountRow>();
  return Number(row?.count ?? 0);
}

async function claimLegacyAccount(
  db: D1Database,
  userId: string,
  profileEncryptionKey: string,
): Promise<void> {
  const now = new Date().toISOString();
  const departureProfileTransfer = await prepareDepartureLocationTransfer(
    db,
    profileEncryptionKey,
    LEGACY_USER_ID,
    userId,
  );
  await db.batch([
    db
      .prepare(
        "UPDATE movie_preferences SET user_id = ? WHERE user_id = ?",
      )
      .bind(userId, LEGACY_USER_ID),
    db
      .prepare(
        "UPDATE cinema_travel_preferences SET user_id = ? WHERE user_id = ?",
      )
      .bind(userId, LEGACY_USER_ID),
    db
      .prepare("UPDATE app_preferences SET user_id = ? WHERE user_id = ?")
      .bind(userId, LEGACY_USER_ID),
    departureProfileTransfer,
    db
      .prepare(
        "UPDATE user_home_station_access SET user_id = ? WHERE user_id = ?",
      )
      .bind(userId, LEGACY_USER_ID),
    db
      .prepare(
        "UPDATE movie_marathon_plans SET user_id = ? WHERE user_id = ?",
      )
      .bind(userId, LEGACY_USER_ID),
    db
      .prepare(
        "UPDATE google_calendar_connections SET user_id = ? WHERE user_id = ?",
      )
      .bind(userId, LEGACY_USER_ID),
    db
      .prepare(
        `UPDATE users
            SET status = 'disabled', updated_at = ?
          WHERE id = ?`,
      )
      .bind(now, LEGACY_USER_ID),
  ]);
}

export async function completeGoogleLogin(
  db: D1Database,
  identity: GoogleIdentity,
  currentSession: ResolvedSession | null,
  profileEncryptionKey: string,
): Promise<AuthUser> {
  const normalizedEmail = normalizeEmail(identity.email);
  if (
    !identity.emailVerified ||
    !normalizedEmail ||
    identity.subject.length === 0 ||
    identity.subject.length > 255
  ) {
    throw new Error("google_identity_not_verified");
  }

  const identityUser = await findGoogleIdentity(db, identity.subject);
  if (identityUser) {
    if (identityUser.status !== "active") {
      throw new Error("user_disabled");
    }
    await db
      .prepare(
        `UPDATE users
            SET last_login_at = ?, updated_at = ?, display_email = ?
          WHERE id = ?`,
      )
      .bind(
        new Date().toISOString(),
        new Date().toISOString(),
        identity.email,
        identityUser.id,
      )
      .run();
    return { ...identityUser, displayEmail: identity.email };
  }

  const emailUser = await findUserByEmail(db, normalizedEmail);
  if (emailUser) {
    if (emailUser.status !== "active") throw new Error("user_disabled");
    await linkGoogleIdentity(
      db,
      emailUser.id,
      identity.subject,
      normalizedEmail,
    );
    return emailUser;
  }

  const count = await realUserCount(db);
  const claimingLegacy =
    count === 0 &&
    currentSession?.legacy === true &&
    currentSession.user.id === LEGACY_USER_ID;
  const invited =
    count > 0 && (await hasAcceptedInvite(db, normalizedEmail));
  if (!claimingLegacy && !invited) {
    throw new Error(
      count === 0 ? "admin_bootstrap_required" : "invite_required",
    );
  }

  const userId = `user_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const role: AuthUser["role"] = claimingLegacy ? "admin" : "member";
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (
           id, email, display_email, role, status, created_at, updated_at,
           last_login_at
         ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .bind(
        userId,
        normalizedEmail,
        identity.email,
        role,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO user_auth_identities (
           provider, provider_subject, user_id, provider_email,
           created_at, updated_at
         ) VALUES ('google', ?, ?, ?, ?, ?)`,
      )
      .bind(identity.subject, userId, normalizedEmail, now, now),
    db
      .prepare(
        `UPDATE user_invites
            SET accepted_at = ?
          WHERE email = ?`,
      )
      .bind(now, normalizedEmail),
  ]);
  if (claimingLegacy) {
    await claimLegacyAccount(db, userId, profileEncryptionKey);
  }
  return {
    id: userId,
    email: normalizedEmail,
    displayEmail: identity.email,
    role,
    status: "active",
  };
}

async function linkGoogleIdentity(
  db: D1Database,
  userId: string,
  subject: string,
  email: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO user_auth_identities (
           provider, provider_subject, user_id, provider_email,
           created_at, updated_at
         ) VALUES ('google', ?, ?, ?, ?, ?)`,
      )
      .bind(subject, userId, email, now, now),
    db
      .prepare(
        `UPDATE users
            SET last_login_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(now, now, userId),
  ]);
}

export async function inviteUser(
  db: D1Database,
  emailValue: string,
  invitedBy: string,
): Promise<string> {
  const email = normalizeEmail(emailValue);
  if (!email) throw new RangeError("invalid_email");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO user_invites (email, invited_by, created_at, accepted_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(email) DO UPDATE SET
         invited_by = excluded.invited_by,
         created_at = excluded.created_at,
         accepted_at = NULL`,
    )
    .bind(email, invitedBy, now)
    .run();
  return email;
}
