import { describe, expect, it } from "vitest";
import {
  createSession,
  hasValidSession,
  loginPage,
  passwordMatches,
  sessionCookie,
} from "../functions/_lib/auth";
import { normalizeReturnHash } from "../functions/auth/login";
import { isPublicShellAssetPath } from "../functions/_middleware";
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

  it("creates a hardened session cookie", () => {
    expect(sessionCookie("signed", 3600)).toContain(
      "HttpOnly; Secure; SameSite=Strict",
    );
  });

  it("renders the Hamamubi brand on the private login page", async () => {
    const response = loginPage();
    const html = await response.text();

    expect(html).toContain("<title>はまむび！ — ログイン</title>");
    expect(html).toContain('src="/brand/hamamubi-icon.svg"');
    expect(html).toContain("<h1>はまむび！</h1>");
    expect(html).toContain('src="/login-route.js"');
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
    expect(isPublicShellAssetPath("/api/showings")).toBe(false);
    expect(isPublicShellAssetPath("/assets/index.js")).toBe(false);
  });

  it("accepts only known view hashes after login", () => {
    expect(normalizeReturnHash("#movies")).toBe("#movies");
    expect(normalizeReturnHash("#CINEMAS")).toBe("#cinemas");
    expect(normalizeReturnHash("#unknown")).toBe("");
    expect(normalizeReturnHash("https://example.com")).toBe("");
    expect(normalizeReturnHash(null)).toBe("");
  });

  it("keeps a valid view hash after a failed login", async () => {
    const response = loginPage(true, normalizeReturnHash("#movies"));
    const html = await response.text();

    expect(html).toContain('name="returnHash" type="hidden" value="#movies"');
  });
});
