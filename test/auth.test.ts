import { describe, expect, it } from "vitest";
import {
  createSession,
  hasValidSession,
  loginPage,
  passwordMatches,
  sessionCookie,
} from "../functions/_lib/auth";
import { isPublicBrandAssetPath } from "../functions/_middleware";
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
    expect(response.headers.get("content-security-policy")).toContain(
      "img-src 'self'",
    );
  });

  it("allows only brand assets needed before login", () => {
    expect(isPublicBrandAssetPath("/brand/hamamubi-icon.svg")).toBe(true);
    expect(isPublicBrandAssetPath("/site.webmanifest")).toBe(true);
    expect(isPublicBrandAssetPath("/api/showings")).toBe(false);
    expect(isPublicBrandAssetPath("/assets/index.js")).toBe(false);
  });
});
