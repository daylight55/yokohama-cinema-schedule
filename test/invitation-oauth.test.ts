import { afterEach, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { onRequestGet as callback } from "../functions/auth/google/login/callback";
import { onRequestGet as start } from "../functions/auth/google/login/start";
import { createInvite, findValidInvite } from "../functions/_lib/invitations";
import type { PagesEnv } from "../functions/_lib/env";
import { testDatabase } from "./helpers/sqlite-d1";

afterEach(() => vi.unstubAllGlobals());
const origin = "https://example.com";
function context(env: PagesEnv, path: string, cookie = "") {
  return {
    env,
    request: new Request(new URL(path, origin), { headers: { cookie } }),
  } as Parameters<typeof callback>[0];
}
function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
function setup() {
  const { db, sqlite } = testDatabase();
  sqlite.exec(
    `INSERT INTO users (id, email, role, status, created_at, updated_at) VALUES ('admin', 'admin@example.com', 'admin', 'active', '2026-09-25', '2026-09-25')`,
  );
  const env: PagesEnv = {
    DB: db,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    SESSION_SECRET: "test-session-secret",
    APP_PASSWORD: "test",
    PROFILE_ENCRYPTION_KEY: "test-profile-key",
  };
  return { db, sqlite, env };
}
it("can retry a wrong Google account from the error page and consume the original invite", async () => {
  const { db, sqlite, env } = setup();
  try {
    const invite = await createInvite(db, "member@example.com", "admin");
    const first = await start(
      context(env, `/auth/google/login/start?invite=${invite.token}`),
    );
    const state = new URL(first.headers.get("location")!).searchParams.get(
      "state",
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test-access" }))
      .mockResolvedValueOnce(
        Response.json({
          sub: "wrong",
          email: "wrong@example.com",
          email_verified: true,
        }),
      )
      .mockResolvedValueOnce(Response.json({ access_token: "test-access" }))
      .mockResolvedValueOnce(
        Response.json({
          sub: "member",
          email: "member@example.com",
          email_verified: true,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const failed = await callback(
      context(
        env,
        `/auth/google/login/callback?state=${state}&code=first-code`,
        cookieHeader(first),
      ),
    );
    expect(failed.status).toBe(401);
    expect(await findValidInvite(db, invite.token)).not.toBeNull();
    const retryHref = load(await failed.text())("a.google").attr("href")!;
    expect(new URL(retryHref, origin).searchParams.get("invite")).toBe(
      invite.token,
    );
    expect(failed.headers.get("referrer-policy")).toBe("no-referrer");
    expect(failed.headers.getSetCookie()).toHaveLength(6);
    expect(
      failed.headers
        .getSetCookie()
        .filter((cookie) => cookie.startsWith("google_login_"))
        .every((cookie) => cookie.includes("Max-Age=0")),
    ).toBe(true);
    const second = await start(context(env, retryHref));
    const secondState = new URL(
      second.headers.get("location")!,
    ).searchParams.get("state");
    expect(secondState).not.toBe(state);
    const success = await callback(
      context(
        env,
        `/auth/google/login/callback?state=${secondState}&code=second-code`,
        cookieHeader(second),
      ),
    );
    expect(success.status).toBe(303);
    expect(success.headers.get("set-cookie")).toContain("yc_session=v2.");
    expect(await findValidInvite(db, invite.token)).toBeNull();
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role='member'")
        .get()?.n,
    ).toBe(1);
  } finally {
    sqlite.close();
  }
});
it.each(["error=access_denied&state=expected", "code=test-code&state=wrong"])(
  "clears stale OAuth cookies but preserves a safe invitation retry on %s",
  async (query) => {
    const { sqlite, env } = setup();
    try {
      const token = "a".repeat(64);
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const response = await callback(
        context(
          env,
          `/auth/google/login/callback?${query}`,
          `google_login_state=expected; google_login_verifier=test; google_login_invite=${token}`,
        ),
      );
      expect(response.status).toBe(401);
      expect(await response.text()).toContain(
        `/auth/google/login/start?lang=ja&invite=${token}`,
      );
      expect(response.headers.getSetCookie()).toHaveLength(6);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      sqlite.close();
    }
  },
);
