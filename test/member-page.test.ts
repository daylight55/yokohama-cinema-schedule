import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet } from "../functions/api/member-page";
import type { AuthContextData, PagesEnv } from "../functions/_lib/env";
import type { MemberPageResponse } from "../shared/member-page";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import { normalizeReturnHash } from "../functions/auth/login";

function fixture() {
  const { db, sqlite } = testDatabase();
  for (const id of ["alice", "bob", "outsider"])
    sqlite
      .prepare(
        "INSERT INTO users(id,email,role,status,created_at,updated_at) VALUES(?,?,'member','active','','')",
      )
      .run(id, `${id}@example.com`);
  sqlite.exec(
    "INSERT INTO sharing_groups VALUES ('ab','Friends',''); INSERT INTO sharing_group_members VALUES ('ab','alice'),('ab','bob');",
  );
  for (const [key, starred, status] of [
    ["unscheduled", 1, null],
    ["watched", 0, "watched"],
    ["hidden", 1, "not_interested"],
    ["removed", 0, null],
  ] as const)
    sqlite
      .prepare(
        "INSERT INTO movie_preferences(user_id,movie_key,title,starred,status,comment,updated_at) VALUES('bob',?,?,?,?, 'private note','')",
      )
      .run(key, key, starred, status);
  for (const date of ["2099-01-01", "2020-01-01"])
    sqlite
      .prepare(
        "INSERT INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,booking_url,reserved_at,created_at,updated_at) VALUES('bob',?,'film','Movie','test','Cinema','Cinema',?,'https://private.example','2026-01-01','','')",
      )
      .run(date, `${date}T12:00:00Z`);
  const context = (viewer = "alice", target = "bob") =>
    ({
      env: { DB: db } as PagesEnv,
      data: {
        userId: viewer,
        authUser: { status: "active" },
      } as AuthContextData,
      request: new Request(
        `https://example.com/api/member-page${target ? `?userId=${encodeURIComponent(target)}` : ""}`,
      ),
    }) as Parameters<typeof onRequestGet>[0];
  return { sqlite, context };
}
describe("member movie pages", () => {
  it("includes unscheduled watchlists, unstarred watched films and future plans without private account fields", async () => {
    const { sqlite, context } = fixture();
    try {
      const response = await onRequestGet(context());
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const data: MemberPageResponse = await response.json();
      expect(data.profile.userId).toBe("bob");
      expect(data.isSelf).toBe(false);
      expect(data.movies.map((m) => m.movieKey)).toEqual([
        "unscheduled",
        "watched",
      ]);
      expect(data.movies[1]).toMatchObject({
        status: "watched",
        starred: false,
      });
      expect(data.plans).toHaveLength(1);
      expect(data.plans[0]).toMatchObject({
        showingId: "2099-01-01",
        reserved: true,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /@example|private note|private\.example|password|bookingUrl/,
      );
      const own: MemberPageResponse = await (
        await onRequestGet(context("bob", ""))
      ).json();
      expect(own.isSelf).toBe(true);
    } finally {
      sqlite.close();
    }
  });
  it("denies unrelated, nonexistent, disabled and former group members", async () => {
    const { sqlite, context } = fixture();
    try {
      for (const target of ["outsider", "missing", "x".repeat(129)])
        expect((await onRequestGet(context("alice", target))).status).toBe(404);
      sqlite.exec("DELETE FROM sharing_group_members WHERE user_id='bob'");
      expect((await onRequestGet(context())).status).toBe(404);
      expect((await onRequestGet(context("bob", "bob"))).status).toBe(200);
      sqlite.exec(
        "INSERT INTO sharing_group_members VALUES ('ab','bob'); UPDATE users SET status='disabled' WHERE id='bob'",
      );
      expect((await onRequestGet(context())).status).toBe(404);
    } finally {
      sqlite.close();
    }
  });
  it("denies public, anonymous, inactive and legacy viewers", async () => {
    const { sqlite, context } = fixture();
    try {
      for (const user of ["", "missing", "legacy-local"])
        expect((await onRequestGet(context(user))).status).toBe(403);
      const publicCtx = context();
      publicCtx.env.PUBLIC_MODE = "true";
      expect((await onRequestGet(publicCtx)).status).toBe(403);
      sqlite.exec("UPDATE users SET status='disabled' WHERE id='alice'");
      expect((await onRequestGet(context())).status).toBe(403);
    } finally {
      sqlite.close();
    }
  });
  it("keeps case-sensitive member links across direct loading and login, rejecting other destinations", () => {
    const hash = hashForAppView("member", { user: "Bob-123" });
    expect(hash).toBe("#member?user=Bob-123");
    expect(appHashStateFromHash(hash)).toMatchObject({
      view: "member",
      user: "Bob-123",
    });
    expect(normalizeReturnHash(hash)).toBe(hash);
    for (const value of [
      "https://evil.example/#member?user=Bob",
      "#member?user=Bob&redirect=evil",
      "#member?user=" + "x".repeat(129),
    ])
      expect(normalizeReturnHash(value)).toBe("");
  });
});
