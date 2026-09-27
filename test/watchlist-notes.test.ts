import { describe, expect, it, vi, afterEach } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { sharedShowing } from "./helpers/shared-showings";
import { onRequestPost } from "../functions/api/preferences";
import { onRequestGet } from "../functions/api/sharing";
import { listMoviePreferences } from "../functions/_lib/preferences";
import {
  sharedWatchlistSections,
  type SharingResponse,
} from "../shared/sharing";
function fixture() {
  const f = testDatabase();
  for (const id of ["a", "b", "outsider"])
    f.sqlite
      .prepare(
        "INSERT INTO users(id,email,role,status,created_at,updated_at) VALUES (?,?,'member','active','','')",
      )
      .run(id, id + "@example.com");
  f.sqlite.exec(
    "INSERT INTO sharing_groups VALUES ('ab','A & B',''); INSERT INTO sharing_group_members VALUES ('ab','a'),('ab','b');",
  );
  return f;
}
function ctx(
  DB: D1Database,
  userId = "a",
  body: unknown = { title: "Film", starred: true },
  origin = "https://example.com",
) {
  return {
    env: { DB },
    data: {
      userId,
      authUser: { id: userId, status: "active", role: "member" },
    },
    request: new Request("https://example.com/api/preferences", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof onRequestPost>[0];
}
afterEach(() => vi.useRealTimers());
describe("shared watchlist planning", () => {
  it("saves an optional note without overwriting stars/status and isolates writers/readers", async () => {
    const { db, sqlite } = fixture();
    try {
      await onRequestPost(
        ctx(db, "a", {
          title: "Film",
          starred: true,
          comment: "  The soundtrack!  ",
        }),
      );
      await onRequestPost(ctx(db, "a", { title: "Film", status: "watched" }));
      await onRequestPost(
        ctx(db, "outsider", {
          title: "Film",
          starred: true,
          comment: "Private to another group",
          userId: "a",
        }),
      );
      await onRequestPost(ctx(db, "a", { title: "Film", comment: "Updated" }));
      expect((await listMoviePreferences(db, "a"))[0]).toMatchObject({
        starred: true,
        status: "watched",
        comment: "Updated",
      });
      sharedShowing(sqlite, "Film");
      const data: SharingResponse = await (await onRequestGet(ctx(db))).json();
      expect(data.movies).toHaveLength(1);
      expect(data.movies[0]).toMatchObject({
        userId: "a",
        status: "watched",
        comment: "Updated",
      });
      expect(JSON.stringify(data)).not.toContain("Private to another group");
      await onRequestPost(ctx(db, "a", { title: "Film", comment: "" }));
      expect((await listMoviePreferences(db, "a"))[0].comment).toBe("");
    } finally {
      sqlite.close();
    }
  });
  it("excludes past, absent, far-future, hidden and disabled-cinema films", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    const { db, sqlite } = fixture();
    try {
      for (const title of [
        "Future",
        "Past",
        "Exact now",
        "Missing",
        "Far future",
        "Disabled",
        "Closed",
        "Hidden",
      ])
        await onRequestPost(
          ctx(db, "a", {
            title,
            starred: true,
            status: title === "Hidden" ? "not_interested" : null,
          }),
        );
      sharedShowing(sqlite, "Future", "2026-09-28T10:00:00Z");
      sharedShowing(sqlite, "Past", "2026-09-27T09:00:00Z");
      sharedShowing(sqlite, "Exact now", "2026-09-27T10:00:00.000Z");
      sharedShowing(sqlite, "Far future", "2026-10-20T10:00:00Z");
      sharedShowing(
        sqlite,
        "Disabled",
        "2026-09-28T10:00:00Z",
        "disabled-test",
      );
      sharedShowing(sqlite, "Closed", "2026-09-28T10:00:00Z", "closed-test");
      sharedShowing(sqlite, "Hidden", "2026-09-28T10:00:00Z");
      sqlite.exec(
        "UPDATE cinemas SET approval='disabled' WHERE id='disabled-test';UPDATE cinemas SET active_until='2026-09-26' WHERE id='closed-test';",
      );
      const data: SharingResponse = await (await onRequestGet(ctx(db))).json();
      expect(data.movies.map((m) => m.title)).toEqual(["Future"]);
      sqlite.exec("DELETE FROM showings");
      expect(
        ((await (await onRequestGet(ctx(db))).json()) as SharingResponse)
          .movies,
      ).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
  it("rejects malformed notes and cross-origin writes without changes", async () => {
    const { db, sqlite } = fixture();
    try {
      for (const body of [
        null,
        { title: 2, starred: true },
        { title: "Film", comment: 2 },
        { title: "Film", comment: "a".repeat(201) },
      ])
        expect((await onRequestPost(ctx(db, "a", body))).status).toBe(400);
      expect(
        (
          await onRequestPost(
            ctx(
              db,
              "a",
              { title: "Film", comment: "x" },
              "https://evil.example",
            ),
          )
        ).status,
      ).toBe(403);
      expect(await listMoviePreferences(db, "a")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
  it("ranks mutual unwatched interest first and separates fully watched films", () => {
    const movie = (
      title: string,
      userId: string,
      status: null | "watched" = null,
    ) => ({ title, userId, status, movieKey: title, imageUrl: null });
    const rows = [
      movie("Solo", "a"),
      movie("Together", "a"),
      movie("Together", "b"),
      movie("Seen", "a", "watched"),
      movie("Mixed", "a", "watched"),
      movie("Mixed", "b"),
    ];
    const sections = sharedWatchlistSections(rows);
    expect(sections.planning[0][0]).toBe("together");
    expect(sections.watched.map(([key]) => key)).toEqual(["seen"]);
    expect(
      sharedWatchlistSections(rows, "a")
        .watched.map(([key]) => key)
        .sort(),
    ).toEqual(["mixed", "seen"]);
  });
});
