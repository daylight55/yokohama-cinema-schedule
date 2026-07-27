import type { PagesEnv } from "./env";

export const SESSION_COOKIE = "yc_session";

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

export async function hasValidSession(
  request: Request,
  env: PagesEnv,
): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const session = cookies.get(SESSION_COOKIE);
  if (!session) return false;
  const parts = session.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) {
    return false;
  }
  const payload = parts.slice(0, 3).join(".");
  const expected = await sign(payload, env.SESSION_SECRET);
  return timingSafeEqual(expected, parts[3]);
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

export async function passwordMatches(
  actual: string,
  expected: string,
): Promise<boolean> {
  if (!expected) return false;
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(actual)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  return timingSafeEqualBytes(
    new Uint8Array(actualDigest),
    new Uint8Array(expectedDigest),
  );
}

export function loginPage(error = false): Response {
  const errorMarkup = error
    ? '<p class="error" role="alert">パスワードが違います。</p>'
    : "";
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>はまむび！ — ログイン</title>
  <link rel="icon" href="/brand/hamamubi-icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/brand/hamamubi-icon-180.png">
  <style>
    :root{color-scheme:dark;font-family:Inter,"Noto Sans JP",system-ui,sans-serif;background:#101414;color:#f3f5ef}
    *{box-sizing:border-box}
    body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 15%,#24302d 0,#101414 45%)}
    main{width:min(100%,390px);padding:32px;border:1px solid #35413d;border-radius:18px;background:#171d1b;box-shadow:0 24px 80px #0008}
    .brand{display:flex;align-items:center;gap:10px;margin:8px 0 12px}
    .brand img{width:48px;height:48px;border-radius:14px;filter:drop-shadow(0 4px 8px #0006)}
    .eyebrow{color:#a9c8b9;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
    h1{color:#fff4d4;font-family:"Hiragino Maru Gothic ProN","ヒラギノ丸ゴ ProN","Yu Gothic UI",sans-serif;font-size:28px;line-height:1.3;margin:0;text-shadow:0 2px 0 #3a5d4f}
    p{color:#b8c1bd;line-height:1.7;margin:0 0 24px}
    label{display:block;font-size:14px;margin-bottom:8px}
    input{width:100%;height:48px;border:1px solid #4c5c56;border-radius:10px;background:#0f1412;color:#fff;padding:0 14px;font:inherit}
    input:focus{outline:3px solid #b7e4c955;outline-offset:2px;border-color:#b7e4c9}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    button{width:100%;height:48px;margin-top:14px;border:0;border-radius:10px;background:#c7f0d8;color:#112019;font-weight:700;font:inherit;cursor:pointer}
    button:hover{background:#dcf7e7}
    .error{color:#ffb4ab;margin:0 0 14px;font-size:14px}
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">Private preview</span>
    <div class="brand">
      <img src="/brand/hamamubi-icon.svg" width="48" height="48" alt="">
      <h1>はまむび！</h1>
    </div>
    <p>個人利用の準備中サイトです。閲覧用パスワードを入力してください。</p>
    ${errorMarkup}
    <form method="post" action="/auth/login">
      <input class="sr-only" name="username" type="text" value="private-site" autocomplete="username" tabindex="-1" aria-hidden="true">
      <label for="password">パスワード</label>
      <input id="password" name="password" type="password" required autofocus autocomplete="current-password">
      <button type="submit">ログイン</button>
    </form>
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
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function parseCookies(value: string): Map<string, string> {
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
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return toBase64Url(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
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
