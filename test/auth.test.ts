import { describe, expect, it } from "vitest";
import {
  createSession,
  hasValidSession,
  passwordMatches,
  sessionCookie,
} from "../functions/_lib/auth";
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
});
