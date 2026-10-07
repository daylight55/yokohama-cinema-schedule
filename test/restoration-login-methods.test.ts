import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { withdrawAccount } from "../shared/account-lifecycle";
import type { PagesEnv } from "../functions/_lib/env";
import { onRequestPost as passkeyLogin } from "../functions/auth/passkeys/verify";
import { onRequestGet as googleLogin } from "../functions/auth/google/login/callback";

vi.mock("../functions/_lib/passkeys", () => ({ authenticatePasskey: vi.fn(async () => "member") }));
vi.mock("../functions/_lib/google-calendar", () => ({
  getGoogleOAuthCredentials: () => ({ clientId: "test", clientSecret: "test" }),
  exchangeGoogleAuthorizationCode: async () => ({ access_token: "test" }),
}));
afterEach(() => vi.unstubAllGlobals());

describe("restoration across login methods", () => {
  for (const method of ["passkey", "Google"]) for (const withdrawn of [false, true]) {
    it(`${method} ${withdrawn ? "requires confirmation for a withdrawn account" : "signs in an active account directly"}`, async () => {
      const { db, sqlite } = testDatabase();
      const env = { DB: db, SESSION_SECRET: "test-restoration-secret", PROFILE_ENCRYPTION_KEY: "unused" } as PagesEnv;
      try {
        sqlite.exec(`INSERT INTO users(id,email,created_at,updated_at) VALUES ('member','member@example.com','now','now');
          INSERT INTO user_auth_identities VALUES('google','subject','member','member@example.com','now','now')`);
        if (withdrawn) await withdrawAccount(db, "member");
        let response: Response;
        if (method === "passkey") {
          response = await passkeyLogin({ env, request: new Request("https://example.org/auth/passkeys/verify", {
            method: "POST", body: JSON.stringify({ challengeId: "test", response: {}, returnHash: "#account" }),
          }) } as Parameters<typeof passkeyLogin>[0]);
          expect(await response.json()).toEqual(withdrawn ? { ok: true, redirect: "/auth/restore" } : { ok: true });
        } else {
          vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sub: "subject", email: "member@example.com", email_verified: true })));
          response = await googleLogin({ env, request: new Request("https://example.org/auth/google/login/callback?state=test&code=test", {
            headers: { cookie: "google_login_state=test; google_login_verifier=test; google_login_language=en" },
          }) } as Parameters<typeof googleLogin>[0]);
          expect(response.headers.get("location")).toBe(`https://example.org/${withdrawn ? "auth/restore" : "#schedule"}`);
        }
        expect(response.headers.get("set-cookie")).toContain(withdrawn ? "yc_restore=" : "yc_session=v2.");
        expect(response.headers.get("set-cookie")).not.toContain(withdrawn ? "yc_session=" : "yc_restore=");
        expect(sqlite.prepare("SELECT count(*) n FROM user_sessions").get()?.n).toBe(withdrawn ? 0 : 1);
        expect(sqlite.prepare("SELECT status FROM users WHERE id='member'").get()?.status).toBe(withdrawn ? "disabled" : "active");
      } finally { sqlite.close(); }
    });
  }
});
