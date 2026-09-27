import { sharedShowing } from "./helpers/shared-showings";
import { completeGoogleLogin } from "../functions/_lib/accounts";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import { normalizeReturnHash } from "../functions/auth/login";
import { describe, it, expect } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import {
  createInvite,
  acceptExistingInvite,
  registerInvitedGoogleUser,
} from "../functions/_lib/invitations";
import { onRequestGet, onRequestPatch } from "../functions/api/sharing";
import {
  onRequestPost,
  onRequestDelete,
} from "../functions/api/account/invites";
import type { SharingResponse } from "../shared/sharing";
function fixture() {
  const f = testDatabase();
  for (const id of ["a", "b", "c", "d"]) {
    f.sqlite
      .prepare(
        "INSERT INTO users(id,email,role,status,created_at,updated_at) VALUES (?,?,'member','active','','')",
      )
      .run(id, `${id}@example.com`);
    f.sqlite
      .prepare(
        "INSERT INTO movie_preferences(user_id,movie_key,title,starred,updated_at) VALUES (?,'film','Film',1,'')",
      )
      .run(id);
    f.sqlite
      .prepare(
        "INSERT INTO member_profiles(user_id,display_name,updated_at) VALUES (?,?, '')",
      )
      .run(id, id.toUpperCase());
  }
  f.sqlite
    .exec(`INSERT INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,booking_url,created_at,updated_at)
      SELECT id, 'session-'||id,'film','Film','test','Test','Test','2099-01-01T03:00:00Z','https://example.com','','' FROM users WHERE id IN ('a','b','c','d')`);
  sharedShowing(f.sqlite,"Film");
  return f;
}
function ctx(
  db: D1Database,
  userId: string,
  method = "GET",
  body?: object,
  group = "",
) {
  return {
    env: { DB: db },
    data: {
      userId,
      authUser: { id: userId, status: "active", role: "member" },
    },
    request: new Request(
      `https://example.com/api/sharing${group ? `?group=${group}` : ""}`,
      {
        method,
        headers: {
          origin: "https://example.com",
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    ),
  } as Parameters<typeof onRequestGet>[0];
}
async function pair(db: D1Database, a: string, b: string, group?: string) {
  const invite = await createInvite(db, `${b}@example.com`, a, group);
  await acceptExistingInvite(db, invite.token, b, `${b}@example.com`);
  return { id: `invite:${invite.id}`, invite };
}
describe("invitation-first sharing groups", () => {
  it("accepts group invites through login for existing email and Google users", async () => {
    const { db, sqlite } = fixture();
    try {
      const first = await createInvite(db, "b@example.com", "a");
      const identity = {
        subject: "google-b",
        email: "b@example.com",
        emailVerified: true,
      };
      expect(
        (
          await completeGoogleLogin(
            db,
            identity,
            null,
            "test-only",
            first.token,
          )
        ).id,
      ).toBe("b");
      const second = await createInvite(db, "b@example.com", "c");
      expect(
        (
          await completeGoogleLogin(
            db,
            identity,
            null,
            "test-only",
            second.token,
          )
        ).id,
      ).toBe("b");
      expect(
        sqlite
          .prepare(
            "SELECT count(*) n FROM sharing_group_members WHERE user_id='b'",
          )
          .get()?.n,
      ).toBe(2);
    } finally {
      sqlite.close();
    }
  });
  it("supports a separate, directly addressable group management screen", () => {
    expect(hashForAppView("groups")).toBe("#groups");
    expect(appHashStateFromHash("#groups").view).toBe("groups");
    expect(normalizeReturnHash("#groups")).toBe("#groups");
  });
  it("creates named pairs and isolates every member, plan and watchlist query", async () => {
    const { db, sqlite } = fixture();
    try {
      const ab = await pair(db, "a", "b"),
        ac = await pair(db, "a", "c");
      const data: SharingResponse = await (
        await onRequestGet(ctx(db, "a", "GET", undefined, ab.id))
      ).json();
      expect(data.groups.map((g) => g.name).sort()).toEqual(["A & B", "A & C"]);
      expect(data.members.map((m) => m.userId)).toEqual(["a", "b"]);
      expect(data.movies.map((m) => m.userId)).toEqual(["a", "b"]);
      expect(data.plans.map((p) => p.userId)).toEqual(["a", "b"]);
      expect(
        (await onRequestGet(ctx(db, "b", "GET", undefined, ac.id))).status,
      ).toBe(403);
      expect(
        ((await (await onRequestGet(ctx(db, "d"))).json()) as SharingResponse)
          .members,
      ).toEqual([]);
      expect(
        (
          await onRequestPatch(
            ctx(db, "b", "PATCH", { groupId: ac.id, name: "leak" }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await onRequestPatch(
            ctx(db, "b", "PATCH", { groupId: ab.id, name: "Movie friends" }),
          )
        ).status,
      ).toBe(200);
      expect(
        sqlite.prepare("SELECT name FROM sharing_groups WHERE id=?").get(ab.id)
          ?.name,
      ).toBe("Movie friends");
    } finally {
      sqlite.close();
    }
  });
  it("adds to the selected group, keeps its name and consumes each invitation only once", async () => {
    const { db, sqlite } = fixture();
    try {
      const ab = await pair(db, "a", "b");
      const added = await pair(db, "b", "c", ab.id);
      expect(
        sqlite.prepare("SELECT count(*) n FROM sharing_groups").get()?.n,
      ).toBe(1);
      expect(
        sqlite
          .prepare(
            "SELECT count(*) n FROM sharing_group_members WHERE group_id=?",
          )
          .get(ab.id)?.n,
      ).toBe(3);
      await expect(
        acceptExistingInvite(db, added.invite.token, "d", "d@example.com"),
      ).rejects.toThrow("invite_required");
      expect(
        (await onRequestPost(ctx(db, "d", "POST", { groupId: ab.id }))).status,
      ).toBe(403);
      // An unrelated user cannot revoke another user's invitation.
      const invite = await createInvite(db, "", "a");
      const revoke = ctx(db, "d", "DELETE");
      revoke.request = new Request(
        `https://example.com/api/account/invites?id=${invite.id}`,
        { method: "DELETE", headers: { origin: "https://example.com" } },
      ) as typeof revoke.request;
      await onRequestDelete(revoke);
      expect(
        sqlite
          .prepare("SELECT revoked_at FROM signup_invites WHERE id=?")
          .get(invite.id)?.revoked_at,
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });
  it("rejects self, mismatched email, withdrawn inviter and lost group membership", async () => {
    const { db, sqlite } = fixture();
    try {
      const self = await createInvite(db, "", "a");
      await expect(
        acceptExistingInvite(db, self.token, "a", "a@example.com"),
      ).rejects.toThrow("invite_required");
      const ab = await pair(db, "a", "b"),
        invite = await createInvite(db, "c@example.com", "b", ab.id);
      await expect(
        acceptExistingInvite(db, invite.token, "d", "d@example.com"),
      ).rejects.toThrow("invite_required");
      sqlite
        .prepare(
          "DELETE FROM sharing_group_members WHERE group_id=? AND user_id='b'",
        )
        .run(ab.id);
      await expect(
        acceptExistingInvite(db, invite.token, "c", "c@example.com"),
      ).rejects.toThrow("invite_required");
      const fresh = await createInvite(db, "", "a");
      sqlite.exec("UPDATE users SET status='disabled' WHERE id='a'");
      await expect(
        registerInvitedGoogleUser(db, fresh.token, {
          subject: "new",
          email: "new@example.com",
          emailVerified: true,
        }),
      ).rejects.toThrow("invite_required");
      expect(
        sqlite
          .prepare("SELECT id FROM users WHERE email='new@example.com'")
          .get(),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
  it("atomically creates a group with new signup and cascades deleted user membership", async () => {
    const { db, sqlite } = fixture();
    try {
      const invite = await createInvite(db, "", "a");
      const user = await registerInvitedGoogleUser(db, invite.token, {
        subject: "new",
        email: "new@example.com",
        emailVerified: true,
      });
      expect(
        sqlite.prepare("SELECT name FROM sharing_groups").get()?.name,
      ).toBe("A & new");
      sqlite.prepare("DELETE FROM users WHERE id=?").run(user.id);
      expect(
        sqlite
          .prepare("SELECT user_id FROM sharing_group_members WHERE user_id=?")
          .get(user.id),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});

it("migrates only historical invitation pairs and bounds default name length", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql") && f < "0031")
      .sort())
      sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
    for (const id of ["a", "b", "unrelated"])
      sqlite
        .prepare(
          "INSERT INTO users(id,email,role,status,created_at,updated_at) VALUES (?,?,'member','active','','')",
        )
        .run(id, id.repeat(60) + "@example.com");
    sqlite.exec(`INSERT INTO signup_invites(id,token_hash,invited_by,created_at,expires_at,accepted_at,accepted_by)
      VALUES ('old','hash','a','2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z','2026-09-01T01:00:00.000Z','b')`);
    sqlite.exec(readFileSync("migrations/0031_sharing_groups.sql", "utf8"));
    expect(
      sqlite
        .prepare("SELECT user_id FROM sharing_group_members ORDER BY user_id")
        .all(),
    ).toEqual([{ user_id: "a" }, { user_id: "b" }]);
    expect(
      sqlite.prepare("SELECT length(name) n FROM sharing_groups").get()?.n,
    ).toBe(83);
  } finally {
    sqlite.close();
  }
});
