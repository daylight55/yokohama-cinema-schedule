import type { PagesEnv } from "./env";

export const SESSION_COOKIE = "yc_session";
export const LEGACY_USER_ID = "legacy-local";
export const PASSWORD_PBKDF2_ITERATIONS = 600_000;
const SESSION_VERSION = "v2";
const MAX_PASSWORD_LENGTH = 256;
const MIN_PASSWORD_LENGTH = 12;

export interface AuthUser {
  id: string;
  email: string | null;
  displayEmail: string | null;
  role: "admin" | "member";
  status: "active" | "disabled";
}

export interface ResolvedSession {
  user: AuthUser;
  legacy: boolean;
}

interface UserRow {
  id: string;
  email: string | null;
  display_email: string | null;
  role: AuthUser["role"];
  status: AuthUser["status"];
}

interface UserSessionRow extends UserRow {
  expires_at: string;
}

interface PasswordRow {
  password_hash: string;
  password_salt: string;
  iterations: number;
}

interface RateLimitRow {
  attempts: number;
  window_started_at: string;
  blocked_until: string | null;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value).buffer,
  );
  return toBase64Url(new Uint8Array(digest));
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayEmail: row.display_email,
    role: row.role,
    status: row.status,
  };
}

async function findFallbackUser(db: D1Database): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT id, email, display_email, role, status
         FROM users
        WHERE status = 'active'
        ORDER BY CASE WHEN id = ? THEN 1 ELSE 0 END, created_at
        LIMIT 1`,
    )
    .bind(LEGACY_USER_ID)
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function createSession(env: PagesEnv): Promise<string> {
  const ttlDays = Math.min(
    Math.max(Number(env.SESSION_TTL_DAYS ?? "30"), 1),
    90,
  );
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86_400;
  const payload = `v1.${expiresAt}.${crypto.randomUUID()}`;
  const signature = await sign(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

export async function createUserSession(
  env: PagesEnv,
  userId: string,
): Promise<{ value: string; maxAge: number }> {
  const ttlDays = Math.min(
    Math.max(Number(env.SESSION_TTL_DAYS ?? "30"), 1),
    90,
  );
  const maxAge = ttlDays * 86_400;
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxAge * 1000);
  await env.DB.prepare(
    `INSERT INTO user_sessions (
       token_hash, user_id, created_at, expires_at, last_used_at
     ) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      userId,
      now.toISOString(),
      expiresAt.toISOString(),
      now.toISOString(),
    )
    .run();
  return { value: `${SESSION_VERSION}.${token}`, maxAge };
}

export async function verifyLegacySession(
  session: string,
  secret: string,
): Promise<boolean> {
  const parts = session.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) {
    return false;
  }
  const payload = parts.slice(0, 3).join(".");
  const expected = await sign(payload, secret);
  return timingSafeEqual(expected, parts[3]);
}

export async function resolveSession(
  request: Request,
  env: PagesEnv,
): Promise<ResolvedSession | null> {
  const session = parseCookies(request.headers.get("cookie") ?? "").get(
    SESSION_COOKIE,
  );
  if (!session) return null;

  if (session.startsWith(`${SESSION_VERSION}.`)) {
    const token = session.slice(SESSION_VERSION.length + 1);
    const row = await env.DB.prepare(
      `SELECT u.id, u.email, u.display_email, u.role, u.status,
              s.expires_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
      .bind(await sha256(token))
      .first<UserSessionRow>();
    if (
      !row ||
      row.status !== "active" ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }
    return { user: mapUser(row), legacy: false };
  }

  if (
    env.SESSION_SECRET &&
    (await verifyLegacySession(session, env.SESSION_SECRET))
  ) {
    if (!env.DB) {
      return {
        user: {
          id: LEGACY_USER_ID,
          email: null,
          displayEmail: null,
          role: "admin",
          status: "active",
        },
        legacy: true,
      };
    }
    const user = await findFallbackUser(env.DB);
    return user ? { user, legacy: true } : null;
  }
  return null;
}

export async function hasValidSession(
  request: Request,
  env: PagesEnv,
): Promise<boolean> {
  return Boolean(await resolveSession(request, env));
}

export async function deleteSession(
  request: Request,
  env: PagesEnv,
): Promise<void> {
  const session = parseCookies(request.headers.get("cookie") ?? "").get(
    SESSION_COOKIE,
  );
  if (!session?.startsWith(`${SESSION_VERSION}.`)) return;
  await env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?")
    .bind(await sha256(session.slice(SESSION_VERSION.length + 1)))
    .run();
}

export function sessionCookie(value: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ].join("; ");
}

export async function passwordMatches(
  actual: string,
  expected: string,
): Promise<boolean> {
  if (!expected) return false;
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(actual).buffer,
    ),
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(expected).buffer,
    ),
  ]);
  return timingSafeEqualBytes(
    new Uint8Array(actualDigest),
    new Uint8Array(expectedDigest),
  );
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password).buffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      iterations,
    },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(derived));
}

export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "パスワードは12文字以上にしてください";
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "パスワードが長すぎます";
  }
  return null;
}

export async function saveUserPassword(
  db: D1Database,
  userId: string,
  password: string,
): Promise<void> {
  const error = validateNewPassword(password);
  if (error) throw new RangeError(error);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(
    password,
    salt,
    PASSWORD_PBKDF2_ITERATIONS,
  );
  await db
    .prepare(
      `INSERT INTO user_password_credentials (
         user_id, password_hash, password_salt, iterations, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         password_salt = excluded.password_salt,
         iterations = excluded.iterations,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      hash,
      toBase64Url(salt),
      PASSWORD_PBKDF2_ITERATIONS,
      new Date().toISOString(),
    )
    .run();
}

export async function verifyUserPassword(
  db: D1Database,
  userId: string,
  password: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT password_hash, password_salt, iterations
         FROM user_password_credentials
        WHERE user_id = ?`,
    )
    .bind(userId)
    .first<PasswordRow>();
  if (!row || password.length > MAX_PASSWORD_LENGTH) return false;
  const actual = await derivePasswordHash(
    password,
    fromBase64Url(row.password_salt),
    row.iterations,
  );
  return timingSafeEqual(actual, row.password_hash);
}

export async function burnPasswordVerification(password: string): Promise<void> {
  await derivePasswordHash(
    password.slice(0, MAX_PASSWORD_LENGTH + 1),
    new Uint8Array(16),
    PASSWORD_PBKDF2_ITERATIONS,
  );
}

export async function authenticationRateKey(
  request: Request,
  identity: string,
): Promise<string> {
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return sha256(`${identity}|${address}`);
}

export async function authenticationRetryAfter(
  db: D1Database,
  rateKey: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT attempts, window_started_at, blocked_until
         FROM auth_rate_limits
        WHERE rate_key = ?`,
    )
    .bind(rateKey)
    .first<RateLimitRow>();
  if (!row?.blocked_until) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(row.blocked_until).getTime() - Date.now()) / 1000),
  );
}

export async function recordAuthenticationFailure(
  db: D1Database,
  rateKey: string,
): Promise<void> {
  const now = new Date();
  const row = await db
    .prepare(
      `SELECT attempts, window_started_at, blocked_until
         FROM auth_rate_limits
        WHERE rate_key = ?`,
    )
    .bind(rateKey)
    .first<RateLimitRow>();
  const windowExpired =
    !row ||
    now.getTime() - new Date(row.window_started_at).getTime() >
      15 * 60 * 1000;
  const attempts = windowExpired ? 1 : row.attempts + 1;
  const windowStartedAt = windowExpired
    ? now.toISOString()
    : row.window_started_at;
  const blockedUntil =
    attempts >= 5
      ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
      : null;
  await db
    .prepare(
      `INSERT INTO auth_rate_limits (
         rate_key, attempts, window_started_at, blocked_until
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(rate_key) DO UPDATE SET
         attempts = excluded.attempts,
         window_started_at = excluded.window_started_at,
         blocked_until = excluded.blocked_until`,
    )
    .bind(rateKey, attempts, windowStartedAt, blockedUntil)
    .run();
}

export async function clearAuthenticationFailures(
  db: D1Database,
  rateKey: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM auth_rate_limits WHERE rate_key = ?")
    .bind(rateKey)
    .run();
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<AuthUser | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = await db
    .prepare(
      `SELECT id, email, display_email, role, status
         FROM users
        WHERE email = ?`,
    )
    .bind(normalized)
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export function loginPage(
  error = false,
  returnHash = "",
  googleConfigured = false,
  errorMessage = "",
): Response {
  const message =
    errorMessage || (error ? "管理者用パスワードが違います。" : "");
  const errorMarkup = message
    ? `<p class="error" role="alert">${escapeHtml(message)}</p>`
    : "";
  const escapedReturnHash = escapeHtml(returnHash);
  const googleMarkup = googleConfigured
    ? `<a class="primary google" href="/auth/google/login/start">Googleでログイン</a>`
    : `<p class="setup-note">GoogleログインはOAuth設定後に利用できます。</p>`;
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>はまむび！ — ログイン</title>
  <link rel="icon" href="/brand/hamamubi-icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/brand/hamamubi-icon-180.png">
  <script src="/login-route.js" defer></script>
  <script src="/passkey-login.js" defer></script>
  <style>
    :root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",system-ui,sans-serif;background:#101414;color:#f3f5ef}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at top,#1b2923,#101414 52%)}
    main{width:min(100%,390px);padding:24px;border:1px solid #33453d;border-radius:20px;background:#17201c;box-shadow:0 24px 60px #0008}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:8px}.brand img{width:50px;height:50px}h1{margin:0;font-size:28px}
    .lead{margin:0 0 20px;color:#aebbb4;font-size:13px;line-height:1.7}.stack,form{display:grid;gap:11px}
    .primary,button,input{min-height:48px;border-radius:11px;font:inherit}.primary,button{display:flex;align-items:center;justify-content:center;border:1px solid #c8f3da;font-weight:800;cursor:pointer;text-decoration:none}
    .primary{background:#bfe9d0;color:#102019}.passkey{width:100%;background:#223028;color:#f3f5ef;border-color:#52675d}
    .divider{display:flex;align-items:center;gap:10px;margin:18px 0;color:#7f8d86;font-size:11px}.divider:before,.divider:after{height:1px;flex:1;background:#34433c;content:""}
    label{font-size:12px;font-weight:700}input{width:100%;padding:0 13px;border:1px solid #42544c;background:#101614;color:#f3f5ef}
    form button{background:#26352e;color:#f3f5ef}.error{padding:10px;border-radius:9px;background:#3a2020;color:#ffb4ab;font-size:12px}
    .setup-note{margin:0;padding:11px;border-radius:9px;background:#202925;color:#9daaa4;font-size:11px;line-height:1.6}
    details{margin-top:18px;border-top:1px solid #34433c;padding-top:14px}summary{color:#8f9d96;font-size:11px;cursor:pointer}
    details form{margin-top:12px}.hidden{display:none!important}
  </style>
</head>
<body>
  <main>
    <div class="brand"><img src="/brand/hamamubi-icon.svg" alt=""><h1>はまむび！</h1></div>
    <p class="lead">Googleアカウント、パスキー、または登録済みパスワードでログインできます。</p>
    ${errorMarkup}
    <div class="stack">
      ${googleMarkup}
      <button id="passkey-login" class="passkey hidden" type="button">パスキーでログイン</button>
      <p id="passkey-message" class="setup-note hidden" role="status"></p>
    </div>
    <div class="divider">メールとパスワード</div>
    <form method="post" action="/auth/password/login">
      <input name="returnHash" type="hidden" value="${escapedReturnHash}">
      <label for="email">メールアドレス</label>
      <input id="email" name="email" type="email" required autocomplete="username webauthn" enterkeyhint="next">
      <label for="current-password">パスワード</label>
      <input id="current-password" name="password" type="password" required autocomplete="current-password" enterkeyhint="done">
      <button type="submit">ログイン</button>
    </form>
    <details>
      <summary>管理者用の閲覧パスワードを使う</summary>
      <form method="post" action="/auth/login">
        <input name="returnHash" type="hidden" value="${escapedReturnHash}">
        <input name="username" type="text" value="administrator" autocomplete="username" hidden>
        <label for="admin-password">閲覧パスワード</label>
        <input id="admin-password" name="password" type="password" required autocomplete="current-password">
        <button type="submit">管理者としてログイン</button>
      </form>
    </details>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy":
        "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseCookies(value: string): Map<string, string> {
  return new Map(
    value
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...rest]) => [key, rest.join("=")]),
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret).buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload).buffer,
    ),
  );
  return toBase64Url(bytes);
}

function timingSafeEqual(a: string, b: string): boolean {
  return timingSafeEqualBytes(
    new TextEncoder().encode(a),
    new TextEncoder().encode(b),
  );
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}
