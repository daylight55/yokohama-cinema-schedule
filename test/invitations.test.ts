import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInvite,
  findValidInvite,
  INVITE_TTL_MS,
  registerInvitedGoogleUser,
} from "../functions/_lib/invitations";
import {
  onRequestGet,
  onRequestPost,
  onRequestDelete,
} from "../functions/api/account/invites";
import { testDatabase } from "./helpers/sqlite-d1";
import type { AuthContextData, PagesEnv } from "../functions/_lib/env";
const identity = {
  subject: "google-member",
  email: "member@example.com",
  emailVerified: true,
};
afterEach(() => vi.useRealTimers());
describe("expiring signup invitations with real SQLite transactions", () => {
  it("stores only the token hash and consumes an invitation once", async () => {
    const { db, sqlite } = testDatabase();
    const invite = await createInvite(db, "", "legacy-local");
    expect(Date.parse(invite.expiresAt) - Date.parse(invite.createdAt)).toBe(
      INVITE_TTL_MS,
    );
    expect(
      sqlite.prepare("SELECT token_hash FROM signup_invites").get()?.token_hash,
    ).not.toBe(invite.token);
    const user = await registerInvitedGoogleUser(db, invite.token, identity);
    expect(user.role).toBe("member");
    expect(await findValidInvite(db, invite.token)).toBeNull();
    await expect(
      registerInvitedGoogleUser(db, invite.token, {
        ...identity,
        subject: "other",
        email: "other@example.com",
      }),
    ).rejects.toThrow("invite_required");
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role='member'")
        .get()?.n,
    ).toBe(1);
    sqlite.close();
  });
  it("rejects at the exact expiry time without creating any user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T00:00:00Z"));
    const { db, sqlite } = testDatabase();
    const invite = await createInvite(db, "", "legacy-local");
    vi.setSystemTime(new Date(invite.expiresAt));
    expect(await findValidInvite(db, invite.token)).toBeNull();
    await expect(
      registerInvitedGoogleUser(db, invite.token, identity),
    ).rejects.toThrow("invite_required");
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role='member'")
        .get()?.n,
    ).toBe(0);
    sqlite.close();
  });
  it("rejects revoked, mismatched and unverified identities", async () => {
    const { db, sqlite } = testDatabase();
    const invite = await createInvite(db, "MEMBER@example.com", "legacy-local");
    await expect(
      registerInvitedGoogleUser(db, invite.token, {
        ...identity,
        email: "other@example.com",
      }),
    ).rejects.toThrow("invite_required");
    await expect(
      registerInvitedGoogleUser(db, invite.token, {
        ...identity,
        emailVerified: false,
      }),
    ).rejects.toThrow("not_verified");
    expect(await findValidInvite(db, invite.token)).not.toBeNull();
    sqlite
      .prepare("UPDATE signup_invites SET revoked_at = ?")
      .run(new Date().toISOString());
    await expect(
      registerInvitedGoogleUser(db, invite.token, identity),
    ).rejects.toThrow("invite_required");
    sqlite.close();
  });
  it("rolls back account creation and consumption if identity insertion fails", async () => {
    const { db, sqlite } = testDatabase();
    sqlite
      .prepare(
        "INSERT INTO user_auth_identities VALUES ('google', ?, 'legacy-local', 'admin@example.com', '', '')",
      )
      .run(identity.subject);
    const invite = await createInvite(db, "", "legacy-local");
    await expect(
      registerInvitedGoogleUser(db, invite.token, identity),
    ).rejects.toThrow();
    expect(await findValidInvite(db, invite.token)).not.toBeNull();
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM users WHERE role='member'")
        .get()?.n,
    ).toBe(0);
    sqlite.close();
  });
});
function context(
  db: D1Database,
  method: string,
  body?: object,
  role: "admin" | "member" = "admin",
  origin = "https://example.com",
) {
  return {
    request: new Request("https://example.com/api/account/invites", {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env: { DB: db } as PagesEnv,
    data: { userId: "legacy-local", authUser: { role } } as AuthContextData,
  } as Parameters<typeof onRequestPost>[0];
}
describe("invitation API authorization and email failures", () => {
  it("denies members for all methods and cross-origin writes", async () => {
    const { db, sqlite } = testDatabase();
    expect(
      (await onRequestPost(context(db, "POST", {}, "member"))).status,
    ).toBe(403);
    expect(
      (await onRequestGet(context(db, "GET", undefined, "member"))).status,
    ).toBe(403);
    expect(
      (await onRequestDelete(context(db, "DELETE", undefined, "member")))
        .status,
    ).toBe(403);
    expect(
      (
        await onRequestPost(
          context(db, "POST", {}, "admin", "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    sqlite.close();
  });
  it("keeps the link usable and reports an email failure instead of claiming success", async () => {
    const { db, sqlite } = testDatabase();
    const ctx = context(db, "POST", { email: identity.email, sendEmail: true });
    ctx.env.INVITE_FROM_EMAIL = "noreply@example.com";
    ctx.env.INVITE_MAILER = {
      fetch: vi.fn(async () => new Response(null, { status: 502 })),
    } as unknown as Fetcher;
    const response = await onRequestPost(ctx);
    const payload = (await response.json()) as {
      url: string;
      emailStatus: string;
    };
    expect(response.status).toBe(201);
    expect(payload.emailStatus).toBe("failed");
    expect(
      await findValidInvite(
        db,
        new URL(payload.url).searchParams.get("token")!,
      ),
    ).not.toBeNull();
    sqlite.close();
  });
});
