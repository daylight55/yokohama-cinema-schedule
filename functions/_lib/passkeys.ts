import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthUser } from "./auth";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface ChallengeRow {
  id: string;
  user_id: string | null;
  challenge: string;
  challenge_type: "registration" | "authentication";
  rp_id: string;
  expected_origin: string;
  expires_at: string;
}

interface CredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type: "singleDevice" | "multiDevice";
  backed_up: number;
  transports: string;
  aaguid: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

const AUTHENTICATOR_TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

function parseTransports(value: string): AuthenticatorTransportFuture[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is AuthenticatorTransportFuture =>
            typeof item === "string" &&
            AUTHENTICATOR_TRANSPORTS.has(
              item as AuthenticatorTransportFuture,
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function requestBinding(request: Request): {
  rpId: string;
  origin: string;
} {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("passkey_secure_context_required");
  }
  return { rpId: url.hostname, origin: url.origin };
}

async function storeChallenge(
  db: D1Database,
  challenge: string,
  type: ChallengeRow["challenge_type"],
  binding: { rpId: string; origin: string },
  userId: string | null,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db
      .prepare(
        `DELETE FROM webauthn_challenges
          WHERE expires_at <= ?`,
      )
      .bind(now.toISOString()),
    db
      .prepare(
        `INSERT INTO webauthn_challenges (
           id, user_id, challenge, challenge_type, rp_id, expected_origin,
           expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        userId,
        challenge,
        type,
        binding.rpId,
        binding.origin,
        new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
        now.toISOString(),
      ),
  ]);
  return id;
}

async function consumeChallenge(
  db: D1Database,
  challengeId: string,
  type: ChallengeRow["challenge_type"],
  binding: { rpId: string; origin: string },
): Promise<ChallengeRow> {
  const row = await db
    .prepare(
      `SELECT id, user_id, challenge, challenge_type, rp_id,
              expected_origin, expires_at
         FROM webauthn_challenges
        WHERE id = ?
          AND challenge_type = ?`,
    )
    .bind(challengeId, type)
    .first<ChallengeRow>();
  await db
    .prepare("DELETE FROM webauthn_challenges WHERE id = ?")
    .bind(challengeId)
    .run();
  if (
    !row ||
    row.rp_id !== binding.rpId ||
    row.expected_origin !== binding.origin ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("passkey_challenge_invalid");
  }
  return row;
}

export async function registrationOptions(
  db: D1Database,
  request: Request,
  user: AuthUser,
) {
  if (!user.email) throw new Error("account_email_required");
  const binding = requestBinding(request);
  const credentials = await db
    .prepare(
      `SELECT id, transports
         FROM webauthn_credentials
        WHERE user_id = ?`,
    )
    .bind(user.id)
    .all<Pick<CredentialRow, "id" | "transports">>();
  const options = await generateRegistrationOptions({
    rpName: "はまむび！",
    rpID: binding.rpId,
    userName: user.email,
    userDisplayName: user.displayEmail ?? user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: (credentials.results ?? []).map((credential) => ({
      id: credential.id,
      transports: parseTransports(credential.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
  });
  const challengeId = await storeChallenge(
    db,
    options.challenge,
    "registration",
    binding,
    user.id,
  );
  return { options, challengeId };
}

export async function registerPasskey(
  db: D1Database,
  request: Request,
  userId: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  nameValue?: string,
): Promise<void> {
  const binding = requestBinding(request);
  const challenge = await consumeChallenge(
    db,
    challengeId,
    "registration",
    binding,
  );
  if (challenge.user_id !== userId) {
    throw new Error("passkey_challenge_user_mismatch");
  }
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expected_origin,
    expectedRPID: challenge.rp_id,
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("passkey_verification_failed");
  const { registrationInfo } = verification;
  const now = new Date().toISOString();
  const name = (nameValue?.trim() || "パスキー").slice(0, 80);
  await db
    .prepare(
      `INSERT INTO webauthn_credentials (
         id, user_id, public_key, counter, device_type, backed_up,
         transports, aaguid, name, created_at, last_used_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      registrationInfo.credential.id,
      userId,
      isoBase64URL.fromBuffer(registrationInfo.credential.publicKey),
      registrationInfo.credential.counter,
      registrationInfo.credentialDeviceType,
      registrationInfo.credentialBackedUp ? 1 : 0,
      JSON.stringify(response.response.transports ?? []),
      registrationInfo.aaguid,
      name,
      now,
    )
    .run();
}

export async function authenticationOptions(
  db: D1Database,
  request: Request,
) {
  const binding = requestBinding(request);
  const options = await generateAuthenticationOptions({
    rpID: binding.rpId,
    allowCredentials: [],
    userVerification: "required",
  });
  const challengeId = await storeChallenge(
    db,
    options.challenge,
    "authentication",
    binding,
    null,
  );
  return { options, challengeId };
}

export async function authenticatePasskey(
  db: D1Database,
  request: Request,
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<string> {
  const binding = requestBinding(request);
  const challenge = await consumeChallenge(
    db,
    challengeId,
    "authentication",
    binding,
  );
  const credential = await db
    .prepare(
      `SELECT c.id, c.user_id, c.public_key, c.counter, c.device_type,
              c.backed_up, c.transports, c.aaguid, c.name, c.created_at,
              c.last_used_at
         FROM webauthn_credentials c
         JOIN users u ON u.id = c.user_id
        WHERE c.id = ?
          AND u.status = 'active'`,
    )
    .bind(response.id)
    .first<CredentialRow>();
  if (!credential) throw new Error("passkey_not_found");
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expected_origin,
    expectedRPID: challenge.rp_id,
    credential: {
      id: credential.id,
      publicKey: isoBase64URL.toBuffer(credential.public_key),
      counter: credential.counter,
      transports: parseTransports(credential.transports),
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("passkey_verification_failed");
  await db
    .prepare(
      `UPDATE webauthn_credentials
          SET counter = ?, device_type = ?, backed_up = ?, last_used_at = ?
        WHERE id = ?`,
    )
    .bind(
      verification.authenticationInfo.newCounter,
      verification.authenticationInfo.credentialDeviceType,
      verification.authenticationInfo.credentialBackedUp ? 1 : 0,
      new Date().toISOString(),
      credential.id,
    )
    .run();
  return credential.user_id;
}

export async function listPasskeys(
  db: D1Database,
  userId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>
> {
  const result = await db
    .prepare(
      `SELECT id, name, created_at, last_used_at
         FROM webauthn_credentials
        WHERE user_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<Pick<CredentialRow, "id" | "name" | "created_at" | "last_used_at">>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}
