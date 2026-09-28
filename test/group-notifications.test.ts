import { describe, it, expect } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import {
  onRequestGet as sharing,
  onRequestPatch as updateGroup,
  onRequestDelete as leave,
} from "../functions/api/sharing";
import {
  onRequestGet as notifications,
  onRequestPatch as read,
} from "../functions/api/notifications";
import { onRequestPost as preference } from "../functions/api/preferences";
import {
  createInvite,
  acceptExistingInvite,
} from "../functions/_lib/invitations";
import { notificationPollDelay } from "../shared/notifications";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import { normalizeReturnHash } from "../functions/auth/login";
import type { NotificationsResponse } from "../shared/notifications";
function fixture() {
  const f = testDatabase();
  for (const id of ["a", "b", "c", "outside"])
    f.sqlite
      .prepare(
        "INSERT INTO users(id,email,status,role,created_at,updated_at) VALUES (?,?,'active','member','','')",
      )
      .run(id, `${id}@example.com`);
  f.sqlite.exec(
    `INSERT INTO sharing_groups VALUES('ab','A & B','1'),('ac','A & C','2'); INSERT INTO sharing_group_members VALUES('ab','a'),('ab','b'),('ac','a'),('ac','c');`,
  );
  return f;
}
function ctx(
  db: D1Database,
  userId = "a",
  body: unknown = undefined,
  url = "https://example.com/api/sharing",
  method = "POST",
) {
  return {
    env: { DB: db },
    data: { userId, authUser: { id: userId, status: "active" } },
    request: new Request(url, {
      method,
      headers: {
        origin: "https://example.com",
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  } as Parameters<typeof notifications>[0];
}
const feed = async (db: D1Database, id = "a", query = "") =>
  (
    await notifications(
      ctx(
        db,
        id,
        undefined,
        `https://example.com/api/notifications${query}`,
        "GET",
      ),
    )
  ).json() as Promise<NotificationsResponse>;
describe("group preferences and membership", () => {
  it("persists one preferred group per member and uses it as default without changing other members", async () => {
    const { db, sqlite } = fixture();
    try {
      expect(
        (await updateGroup(ctx(db, "a", { action: "prefer", groupId: "ac" })))
          .status,
      ).toBe(200);
      expect(
        ((await (await sharing(ctx(db))).json()) as { groupId: string })
          .groupId,
      ).toBe("ac");
      expect(
        ((await (await sharing(ctx(db, "b"))).json()) as { groupId: string })
          .groupId,
      ).toBe("ab");
      expect(
        (await updateGroup(ctx(db, "b", { action: "prefer", groupId: "ac" })))
          .status,
      ).toBe(403);
      await updateGroup(ctx(db, "a", { action: "prefer", groupId: "ab" }));
      expect(
        sqlite.prepare("SELECT count(*) n FROM sharing_preferences").get()?.n,
      ).toBe(1);
    } finally {
      sqlite.close();
    }
  });
  it("leaves only own membership, clears preference/access and revokes outstanding invitations even after rejoining", async () => {
    const { db, sqlite } = fixture();
    try {
      await updateGroup(ctx(db, "a", { action: "prefer", groupId: "ab" }));
      const invite = await createInvite(db, "outside@example.com", "a", "ab");
      await preference(ctx(db, "b", { title: "Film", starred: true }));
      expect((await feed(db)).unread).toBe(1);
      expect(
        (
          await leave(
            ctx(
              db,
              "a",
              undefined,
              "https://example.com/api/sharing?group=ab",
              "DELETE",
            ),
          )
        ).status,
      ).toBe(200);
      expect((await feed(db)).items).toHaveLength(0);
      expect(
        ((await (await sharing(ctx(db))).json()) as { groupId: string })
          .groupId,
      ).toBe("ac");
      expect(
        sqlite.prepare("SELECT * FROM sharing_preferences").get(),
      ).toBeUndefined();
      expect(
        (
          await sharing(
            ctx(
              db,
              "a",
              undefined,
              "https://example.com/api/sharing?group=ab",
              "GET",
            ),
          )
        ).status,
      ).toBe(403);
      expect(
        sqlite
          .prepare(
            "SELECT user_id FROM sharing_group_members WHERE group_id='ab'",
          )
          .all(),
      ).toEqual([{ user_id: "b" }]);
      sqlite.exec("INSERT INTO sharing_group_members VALUES('ab','a')");
      await expect(
        acceptExistingInvite(
          db,
          invite.token,
          "outside",
          "outside@example.com",
        ),
      ).rejects.toThrow();
      expect((await feed(db)).items).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
  it("removes an empty group and rejects foreign origins/outsiders", async () => {
    const { db, sqlite } = fixture();
    try {
      const foreign = ctx(db);
      foreign.request = new Request(
        "https://example.com/api/sharing?group=ab",
        { method: "DELETE", headers: { origin: "https://evil.example" } },
      ) as typeof foreign.request;
      expect((await leave(foreign)).status).toBe(403);
      expect(
        (
          await leave(
            ctx(
              db,
              "outside",
              undefined,
              "https://example.com/api/sharing?group=ab",
              "DELETE",
            ),
          )
        ).status,
      ).toBe(403);
      await leave(
        ctx(
          db,
          "a",
          undefined,
          "https://example.com/api/sharing?group=ab",
          "DELETE",
        ),
      );
      await leave(
        ctx(
          db,
          "b",
          undefined,
          "https://example.com/api/sharing?group=ab",
          "DELETE",
        ),
      );
      expect(
        sqlite.prepare("SELECT * FROM sharing_groups WHERE id='ab'").get(),
      ).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});
describe("group notification feed", () => {
  it("records transitions atomically, scopes to event-time audience, suppresses repeats and includes current shared notes", async () => {
    const { db, sqlite } = fixture();
    try {
      await preference(
        ctx(db, "b", { title: "Film", starred: true, comment: "Soundtrack!" }),
      );
      await preference(ctx(db, "b", { title: "Film", starred: true }));
      let value = await feed(db);
      expect(value.items).toHaveLength(1);
      expect(value.items[0]).toMatchObject({
        kind: "starred",
        name: "b",
        comment: "Soundtrack!",
        groupId: "ab",
      });
      expect(await feed(db, "b")).toMatchObject({ items: [], unread: 0 });
      expect((await feed(db, "c")).items).toHaveLength(0);
      await preference(ctx(db, "b", { title: "Film", status: "watched" }));
      await preference(ctx(db, "b", { title: "Film", status: "watched" }));
      await preference(
        ctx(db, "b", { title: "Film", comment: "See it together!" }),
      );
      value = await feed(db);
      expect(value.items.map((i) => i.kind)).toEqual([
        "comment",
        "watched",
        "starred",
      ]);
      expect(value.items.every((i) => i.comment === "See it together!")).toBe(
        true,
      );
      sqlite.exec("INSERT INTO sharing_group_members VALUES('ab','outside')");
      expect((await feed(db, "outside")).items).toHaveLength(0);
      await preference(ctx(db, "b", { title: "Other", status: "watched" }));
      expect((await feed(db, "outside")).items).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
  it("keeps read cursor monotonic, bounds forged cursors and never marks a concurrently arriving event read", async () => {
    const { db, sqlite } = fixture();
    try {
      await preference(ctx(db, "b", { title: "First", starred: true }));
      const first = await feed(db);
      await preference(ctx(db, "b", { title: "Second", starred: true }));
      await read(ctx(db, "a", { through: first.latestId }));
      expect((await feed(db)).unread).toBe(1);
      await read(ctx(db, "a", { through: 0 }));
      expect((await feed(db)).unread).toBe(1);
      await read(ctx(db, "a", { through: Number.MAX_SAFE_INTEGER }));
      expect((await feed(db)).unread).toBe(0);
      await preference(ctx(db, "b", { title: "Third", starred: true }));
      expect((await feed(db)).unread).toBe(1);
      expect((await read(ctx(db, "a", { through: -1 }))).status).toBe(400);
      const foreign = ctx(db, "a", { through: 10 });
      foreign.request = new Request("https://example.com/api/notifications", {
        method: "PATCH",
        body: '{"through":10}',
        headers: { origin: "https://evil.example" },
      }) as typeof foreign.request;
      expect((await read(foreign)).status).toBe(403);
    } finally {
      sqlite.close();
    }
  });
  it("removes revoked sharing, hides suspended members, and cascades actor departures and account deletion", async () => {
    const { db, sqlite } = fixture();
    try {
      await preference(
        ctx(db, "b", {
          title: "Film",
          starred: true,
          comment: "Private on unstar",
        }),
      );
      await preference(ctx(db, "b", { title: "Film", starred: false }));
      expect((await feed(db)).items).toHaveLength(0);
      await preference(ctx(db, "b", { title: "Film", status: "watched" }));
      expect((await feed(db)).items[0].comment).toBe("");
      sqlite.exec("UPDATE users SET status='disabled' WHERE id='b'");
      expect((await feed(db)).items).toHaveLength(0);
      sqlite.exec("UPDATE users SET status='active' WHERE id='b'");
      await leave(
        ctx(
          db,
          "b",
          undefined,
          "https://example.com/api/sharing?group=ab",
          "DELETE",
        ),
      );
      expect((await feed(db)).items).toHaveLength(0);
      await preference(ctx(db, "c", { title: "New", starred: true }));
      expect((await feed(db)).unread).toBe(1);
      sqlite.exec("DELETE FROM users WHERE id='c'");
      expect((await feed(db)).unread).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it("paginates with stable ids, limits summary payloads and filters expired history", async () => {
    const { db, sqlite } = fixture();
    try {
      for (let i = 0; i < 53; i++)
        await preference(ctx(db, "b", { title: `Film ${i}`, starred: true }));
      const first = await feed(db);
      expect(first.items).toHaveLength(50);
      expect(first.unread).toBe(53);
      const next = await feed(db, "a", `?before=${first.nextBefore}`);
      expect(next.items).toHaveLength(3);
      expect(next.nextBefore).toBeNull();
      const summary = await feed(db, "a", "?summary=1");
      expect(summary.items).toHaveLength(5);
      expect(summary.titles).toEqual([]);
      sqlite.exec(
        "UPDATE group_activity SET created_at='2000-01-01T00:00:00.000Z'",
      );
      expect((await feed(db)).unread).toBe(0);
      expect(
        (
          await notifications(
            ctx(
              db,
              "a",
              undefined,
              "https://example.com/api/notifications?before=NaN",
              "GET",
            ),
          )
        ).status,
      ).toBe(400);
    } finally {
      sqlite.close();
    }
  });
});
it("pauses hidden-page polling without opt-in, backs off and stops after five failures", () => {
  expect(notificationPollDelay(0, false, false)).toBe(60000);
  expect(notificationPollDelay(0, true, false)).toBeNull();
  expect(notificationPollDelay(0, true, true)).toBe(120000);
  expect(notificationPollDelay(3, false, true)).toBe(480000);
  expect(notificationPollDelay(5, false, true)).toBeNull();
});
it("keeps direct notification hash and auth return routing", () => {
  expect(hashForAppView("notifications")).toBe("#notifications");
  expect(appHashStateFromHash("#notifications").view).toBe("notifications");
  expect(normalizeReturnHash("#notifications")).toBe("#notifications");
});
