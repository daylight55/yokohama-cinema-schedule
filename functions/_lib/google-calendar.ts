import type {
  GoogleCalendarConnectionStatus,
  MovieMarathonPlan,
} from "../../shared/types";
import type { PagesEnv } from "./env";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
];

interface CalendarConnectionRow {
  email: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  scopes: string;
  created_at: string;
  updated_at: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleCalendarCredentials {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
}

export type GoogleOAuthCredentials = Pick<
  GoogleCalendarCredentials,
  "clientId" | "clientSecret"
>;

export function getGoogleOAuthCredentials(
  env: PagesEnv,
): GoogleOAuthCredentials | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function utf8(value: string): ArrayBuffer {
  return asArrayBuffer(new TextEncoder().encode(value));
}

async function importEncryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptGoogleToken(
  token: string,
  secret: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    key,
    utf8(token),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptGoogleToken(
  ciphertext: string,
  iv: string,
  secret: string,
): Promise<string> {
  const key = await importEncryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(iv)) },
    key,
    asArrayBuffer(base64ToBytes(ciphertext)),
  );
  return new TextDecoder().decode(plaintext);
}

export function getGoogleCalendarCredentials(
  env: PagesEnv,
): GoogleCalendarCredentials | null {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_TOKEN_ENCRYPTION_KEY
  ) {
    return null;
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    encryptionKey: env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  };
}

export async function getGoogleCalendarStatus(
  env: PagesEnv,
  userId = "legacy-local",
): Promise<GoogleCalendarConnectionStatus> {
  const configured = Boolean(getGoogleCalendarCredentials(env));
  if (!configured || env.PUBLIC_MODE === "true") {
    return {
      configured,
      connected: false,
      email: null,
      updatedAt: null,
    };
  }
  const row = await env.DB.prepare(
    `SELECT email, refresh_token_ciphertext, refresh_token_iv, scopes,
            created_at, updated_at
       FROM google_calendar_connections
      WHERE user_id = ?`,
  )
    .bind(userId)
    .first<CalendarConnectionRow>();
  return {
    configured: true,
    connected: Boolean(row),
    email: row?.email ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveGoogleCalendarConnection(
  env: PagesEnv,
  userId: string,
  email: string,
  refreshToken: string,
  scopes: string,
): Promise<void> {
  const credentials = getGoogleCalendarCredentials(env);
  if (!credentials) throw new Error("google_calendar_not_configured");
  const encrypted = await encryptGoogleToken(
    refreshToken,
    credentials.encryptionKey,
  );
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO google_calendar_connections (
       user_id, email, refresh_token_ciphertext, refresh_token_iv,
       scopes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       refresh_token_iv = excluded.refresh_token_iv,
       scopes = excluded.scopes,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      email,
      encrypted.ciphertext,
      encrypted.iv,
      scopes,
      now,
      now,
    )
    .run();
}

export async function disconnectGoogleCalendar(
  db: D1Database,
  userId = "legacy-local",
): Promise<void> {
  await db
    .prepare("DELETE FROM google_calendar_connections WHERE user_id = ?")
    .bind(userId)
    .run();
}

async function getConnectionRow(
  db: D1Database,
  userId: string,
): Promise<CalendarConnectionRow> {
  const row = await db
    .prepare(
      `SELECT email, refresh_token_ciphertext, refresh_token_iv, scopes,
              created_at, updated_at
         FROM google_calendar_connections
        WHERE user_id = ?`,
    )
    .bind(userId)
    .first<CalendarConnectionRow>();
  if (!row) throw new Error("google_calendar_not_connected");
  return row;
}

export async function refreshGoogleAccessToken(
  env: PagesEnv,
  userId = "legacy-local",
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const credentials = getGoogleCalendarCredentials(env);
  if (!credentials) throw new Error("google_calendar_not_configured");
  const connection = await getConnectionRow(env.DB, userId);
  const refreshToken = await decryptGoogleToken(
    connection.refresh_token_ciphertext,
    connection.refresh_token_iv,
    credentials.encryptionKey,
  );
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? "google_token_refresh_failed");
  }
  return payload.access_token;
}

export async function exchangeGoogleAuthorizationCode(
  credentials: GoogleOAuthCredentials,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleTokenResponse> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? "google_code_exchange_failed");
  }
  return payload;
}

export function buildGoogleCalendarEvent(plan: MovieMarathonPlan) {
  if (plan.items.length === 0) {
    throw new Error("empty_movie_marathon_plan");
  }
  const first = plan.items[0];
  const last = plan.items.at(-1)!;
  const description = plan.items
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}\n${item.cinemaName}\n${item.startsAt}〜${item.endsAt}\n${item.bookingUrl}`,
    )
    .join("\n\n");
  return {
    summary: `🎬 はまむび！映画はしご（${plan.items.length}本）`,
    description: `気になる映画を優先した映画はしごプランです。\n\n${description}`,
    location: first.cinemaName,
    start: {
      dateTime: first.startsAt,
      timeZone: "Asia/Tokyo",
    },
    end: {
      dateTime: last.endsAt,
      timeZone: "Asia/Tokyo",
    },
  };
}
