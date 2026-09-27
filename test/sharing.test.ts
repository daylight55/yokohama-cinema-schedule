import { groupSharedMovies } from "../shared/sharing";
import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet } from "../functions/api/sharing";
import type { AuthContextData, PagesEnv } from "../functions/_lib/env";
import type { SharingResponse } from "../shared/sharing";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import { normalizeReturnHash } from "../functions/auth/login";

function fixture() {
  const db = testDatabase();
  for (const id of ["alice", "bob", "disabled"]) {
    db.sqlite
      .prepare(
        `INSERT INTO users(id,email,display_email,role,status,created_at,updated_at) VALUES (?,?,?,'member',?,'','')`,
      )
      .run(
        id,
        `${id}@example.com`,
        `${id}@example.com`,
        id === "disabled" ? "disabled" : "active",
      );
    db.sqlite
      .prepare(
        `INSERT INTO movie_preferences(user_id,movie_key,title,starred,updated_at) VALUES (?, 'film', '共有映画', 1, '')`,
      )
      .run(id);
    db.sqlite
      .prepare(
        `INSERT INTO movie_preferences(user_id,movie_key,title,starred,status,updated_at) VALUES (?, 'hidden', '非表示映画', 0, 'not_interested', '')`,
      )
      .run(id);
    for (const date of ["2099-01-01", "2020-01-01"])
      db.sqlite
        .prepare(
          `INSERT INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,booking_url,reserved_at,created_at,updated_at) VALUES (?,?,'film','共有映画','test','テスト館','テスト',?,'https://example.com',?,'','')`,
        )
        .run(
          id,
          date,
          `${date}T12:00:00Z`,
          id === "alice" ? "2026-01-01" : null,
        );
  }
  return db;
}
function context(DB: D1Database, userId = "alice", publicMode = false) {
  return {
    request: new Request("https://example.com/api/sharing?userId=disabled"),
    env: { DB, PUBLIC_MODE: String(publicMode) } as PagesEnv,
    data: {
      userId,
      authUser: { id: userId, role: "member", status: "active" },
    } as AuthContextData,
  } as Parameters<typeof onRequestGet>[0];
}
describe("automatic sharing between registered users", () => {
  it("shares active users without opt-in, labels every entry, and excludes past plans and unstarred films", async () => {
    const { db, sqlite } = fixture();
    try {
      const response = await onRequestGet(context(db));
      const data: SharingResponse = await response.json();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(data.members.map((m) => m.userId)).toEqual(["alice", "bob"]);
      expect(data.plans).toHaveLength(2);
      expect(data.plans.map((p) => p.userId)).toEqual(["alice", "bob"]);
      expect(data.plans.map((p) => p.reserved)).toEqual([true, false]);
      expect(data.movies.map((m) => m.movieKey)).toEqual(["film", "film"]);
      expect(data.plans[0]).not.toHaveProperty("bookingUrl");
      expect(data.plans[0]).not.toHaveProperty("note");
      // A filter supplied by the client cannot expand scope to a disabled account.
      expect(JSON.stringify(data)).not.toContain("disabled");
    } finally {
      sqlite.close();
    }
  });
  it("reflects changes without copying data and removes a disabled member immediately", async () => {
    const { db, sqlite } = fixture();
    try {
      sqlite.exec(
        `UPDATE movie_preferences SET starred=0 WHERE user_id='alice'; DELETE FROM viewing_plans WHERE user_id='alice'; UPDATE users SET status='disabled' WHERE id='bob';`,
      );
      const data: SharingResponse = await (
        await onRequestGet(context(db))
      ).json();
      expect(data.members.map((m) => m.userId)).toEqual(["alice"]);
      expect(data.movies).toEqual([]);
      expect(data.plans).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
  it("denies public mode, anonymous, unknown, disabled and unclaimed legacy accounts", async () => {
    const { db, sqlite } = fixture();
    try {
      expect((await onRequestGet(context(db, "alice", true))).status).toBe(403);
      for (const user of ["", "unknown", "disabled", "legacy-local"])
        expect((await onRequestGet(context(db, user))).status).toBe(403);
      const ctx = context(db);
      ctx.data.authUser.status = "disabled";
      expect((await onRequestGet(ctx)).status).toBe(403);
    } finally {
      sqlite.close();
    }
  });
  it("supports direct shared links, reloads and the password login return route", () => {
    expect(hashForAppView("shared")).toBe("#shared");
    expect(appHashStateFromHash("#shared").view).toBe("shared");
    expect(normalizeReturnHash("#shared")).toBe("#shared");
    expect(normalizeReturnHash("//evil.example/#shared")).toBe("");
  });
});

it("normalizes legacy watchlist keys for detail links and deduplicates each member", () => {
  const movie = {
    userId: "alice",
    movieKey: "goodboy/グッド・ボーイ",
    title: "GOOD BOY/グッド・ボーイ",
    imageUrl: null,
  };
  const groups = groupSharedMovies([
    movie,
    { ...movie, movieKey: "new-key" },
    { ...movie, userId: "bob" },
  ]);
  expect([...groups.keys()]).toEqual(["goodboyグッド・ボーイ"]);
  expect([...groups.values()][0].map((m) => m.userId)).toEqual([
    "alice",
    "bob",
  ]);
  expect([...groupSharedMovies([movie], "bob")]).toEqual([]);
});
