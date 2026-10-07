import { createUserSession, parseCookies } from "./auth";
import type { PagesEnv } from "./env";
import { normalizeReturnHash } from "../auth/login";

const COOKIE = "yc_restore";
const TTL = 600;
interface RestoreProof {
  userId: string;
  withdrawnAt: string;
  expiresAt: number;
  returnHash: string;
}

export function restorationCookie(value = "", maxAge = 0): string {
  return `${COOKIE}=${value}; Path=/auth/restore; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function signature(payload: string, secret: string): Promise<string> {
  if (!secret) throw new Error("session_secret_unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`account-restoration.${payload}`))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Only call after verifying password, Google identity, or a passkey. */
export async function authenticatedLogin(env: PagesEnv, userId: string, returnHash = "") {
  const row = await env.DB.prepare(
    "SELECT status,withdrawn_at,delete_after FROM users WHERE id=?",
  ).bind(userId).first<{ status: string; withdrawn_at: string | null; delete_after: string | null }>();
  if (row?.status === "disabled" && row.withdrawn_at && row.delete_after && row.delete_after > new Date().toISOString()) {
    const proof: RestoreProof = { userId, withdrawnAt: row.withdrawn_at,
      expiresAt: Date.now() + TTL * 1000, returnHash: normalizeReturnHash(returnHash) };
    const payload = btoa(JSON.stringify(proof)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    return { restoreCookie: restorationCookie(`${payload}.${await signature(payload, env.SESSION_SECRET)}`, TTL) };
  }
  return { session: await createUserSession(env, userId) };
}

export async function restorationProof(request: Request, env: PagesEnv): Promise<RestoreProof | null> {
  try {
    const value = parseCookies(request.headers.get("cookie") ?? "").get(COOKIE) ?? "";
    const [payload, received, extra] = value.split(".");
    if (!payload || !received || extra || value.length > 2048) return null;
    const expected = await signature(payload, env.SESSION_SECRET);
    if (received.length !== expected.length) return null;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= received.charCodeAt(i) ^ expected.charCodeAt(i);
    if (difference) return null;
    const proof = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))) as RestoreProof;
    if (!Number.isFinite(proof.expiresAt) || proof.expiresAt <= Date.now()) return null;
    const row = await env.DB.prepare(`SELECT id FROM users WHERE id=? AND status='disabled'
      AND withdrawn_at=? AND delete_after>?`).bind(proof.userId, proof.withdrawnAt, new Date().toISOString()).first();
    return row ? { ...proof, returnHash: normalizeReturnHash(proof.returnHash) } : null;
  } catch { return null; }
}
