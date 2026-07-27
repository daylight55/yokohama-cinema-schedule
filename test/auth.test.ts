import { describe, expect, it, vi } from "vitest";
import {
  createSession,
  createUserSession,
  deleteSession,
  hasValidSession,
  loginPage,
  normalizeEmail,
  passwordMatches,
  saveUserPassword,
  sessionCookie,
  verifyUserPassword,
} from "../functions/_lib/auth";
import { normalizeReturnHash } from "../functions/auth/login";
import {
  isPublicAuthPath,
  isPublicShellAssetPath,
} from "../functions/_middleware";
import type { PagesEnv } from "../functions/_lib/env";

const env = {
  SESSION_SECRET: "test-session-secret-with-enough-entropy",
  APP_PASSWORD: "private-password",
  SESSION_TTL_DAYS: "30",
} as PagesEnv;

describe("private site authentication", () => {
  it("accepts a newly signed session and rejects tampering", async () => {
    const session = await createSession(env);
    const validRequest = new Request("https://example.com", {
      headers: { cookie: `yc_session=${session}` },
    });
    expect(await hasValidSession(validRequest, env)).toBe(true);

    const tamperedRequest = new Request("https://example.com", {
      headers: { cookie: `yc_session=${session.slice(0, -1)}x` },
    });
    expect(await hasValidSession(tamperedRequest, env)).toBe(false);
  });

  it("compares passwords without storing a client-visible credential", async () => {
    expect(await passwordMatches("private-password", env.APP_PASSWORD)).toBe(
      true,
    );
    expect(await passwordMatches("wrong", env.APP_PASSWORD)).toBe(false);
  });

  it("stores user passwords as salted PBKDF2 hashes", async () => {
    let stored:
      | {
          hash: string;
          salt: string;
          iterations: number;
        }
      | undefined;
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            if (sql.includes("INSERT INTO user_password_credentials")) {
              stored = {
                hash: String(values[1]),
                salt: String(values[2]),
                iterations: Number(values[3]),
              };
            }
          },
          first: async () =>
            sql.includes("FROM user_password_credentials")
              ? {
                  password_hash: stored?.hash,
                  password_salt: stored?.salt,
                  iterations: stored?.iterations,
                }
              : null,
        }),
      })),
    } as unknown as D1Database;

    await saveUserPassword(db, "user-1", "a secure movie password");

    expect(stored?.hash).not.toContain("secure movie password");
    expect(stored?.salt).not.toBe("");
    expect(stored?.iterations).toBe(600_000);
    await expect(
      verifyUserPassword(db, "user-1", "a secure movie password"),
    ).resolves.toBe(true);
    await expect(
      verifyUserPassword(db, "user-1", "wrong password"),
    ).resolves.toBe(false);
  });

  it("stores only a hash of opaque user session tokens and can revoke it", async () => {
    let tokenHash = "";
    let deletedHash = "";
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            if (sql.includes("INSERT INTO user_sessions")) {
              tokenHash = String(values[0]);
            }
            if (sql.includes("DELETE FROM user_sessions")) {
              deletedHash = String(values[0]);
            }
          },
        }),
      })),
    } as unknown as D1Database;
    const sessionEnv = { ...env, DB: db };

    const session = await createUserSession(sessionEnv, "user-1");
    const rawToken = session.value.replace(/^v2\./, "");
    expect(tokenHash).not.toBe(rawToken);
    await deleteSession(
      new Request("https://example.com", {
        headers: { cookie: `yc_session=${session.value}` },
      }),
      sessionEnv,
    );
    expect(deletedHash).toBe(tokenHash);
  });

  it("creates a hardened session cookie", () => {
    expect(sessionCookie("signed", 3600)).toContain(
      "HttpOnly; Secure; SameSite=Strict",
    );
  });

  it("renders the Hamamubi brand on the private login page", async () => {
    const response = loginPage();
    const html = await response.text();

    expect(html).toContain("<title>はまむび！ — ログイン</title>");
    expect(html).toContain('src="/brand/hamamubi-icon-v2.svg"');
    expect(html).toContain("<h1>はまむび！</h1>");
    expect(html).toContain('src="/login-route.js"');
    expect(html).toContain('src="/passkey-login.js"');
    expect(html).toContain('autocomplete="username webauthn"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('name="returnHash"');
    expect(response.headers.get("content-security-policy")).toContain(
      "img-src 'self'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
  });

  it("allows only shell assets needed before login", () => {
    expect(isPublicShellAssetPath("/brand/hamamubi-icon.svg")).toBe(true);
    expect(isPublicShellAssetPath("/site.webmanifest")).toBe(true);
    expect(isPublicShellAssetPath("/login-route.js")).toBe(true);
    expect(isPublicShellAssetPath("/passkey-login.js")).toBe(true);
    expect(isPublicShellAssetPath("/api/showings")).toBe(false);
    expect(isPublicShellAssetPath("/assets/index.js")).toBe(false);
  });

  it("keeps only login and OAuth callback endpoints public", () => {
    expect(isPublicAuthPath("/auth/google/login/start")).toBe(true);
    expect(isPublicAuthPath("/auth/google/login/callback")).toBe(true);
    expect(isPublicAuthPath("/auth/google/callback")).toBe(true);
    expect(isPublicAuthPath("/auth/google/start")).toBe(false);
    expect(isPublicAuthPath("/auth/google/disconnect")).toBe(false);
  });

  it("accepts only known view hashes after login", () => {
    expect(normalizeReturnHash("#movies")).toBe("#movies");
    expect(normalizeReturnHash("#planner")).toBe("#planner");
    expect(normalizeReturnHash("#account")).toBe("#account");
    expect(normalizeReturnHash("#CINEMAS")).toBe("#cinemas");
    expect(normalizeReturnHash("#unknown")).toBe("");
    expect(normalizeReturnHash("https://example.com")).toBe("");
    expect(normalizeReturnHash(null)).toBe("");
  });

  it("normalizes a valid email lookup key without changing display data", () => {
    expect(normalizeEmail("  Person+Movies@Example.COM ")).toBe(
      "person+movies@example.com",
    );
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("keeps a valid view hash after a failed login", async () => {
    const response = loginPage(true, normalizeReturnHash("#movies"));
    const html = await response.text();

    expect(html).toContain('name="returnHash" type="hidden" value="#movies"');
  });
});
