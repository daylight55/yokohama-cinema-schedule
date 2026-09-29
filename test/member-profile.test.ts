import { describe, expect, it } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet, onRequestPatch } from "../functions/api/account/profile";
import { onRequestGet as avatarGet } from "../functions/api/account/avatar";
import { onRequestGet as sharing } from "../functions/api/sharing";
import type { AuthContextData, PagesEnv } from "../functions/_lib/env";
import type { MemberProfile } from "../shared/member-profile";
import type { SharingResponse } from "../shared/sharing";
function fixture() {
  const { db, sqlite } = testDatabase();
  for (const id of ["alice", "bob"])
    sqlite
      .prepare(
        "INSERT INTO users(id,email,role,status,created_at,updated_at) VALUES(?,?,'member','active','','')",
      )
      .run(id, `${id}@example.com`);
  sqlite.exec("INSERT INTO sharing_groups VALUES ('ab','Alice & Bob',''); INSERT INTO sharing_group_members VALUES ('ab','alice'),('ab','bob');");
  function context(
    method = "GET",
    body?: object,
    userId = "alice",
    path = "/api/account/profile",
    origin = "https://example.com",
  ) {
    return {
      env: { DB: db } as PagesEnv,
      data: { userId, authUser: { status: "active" } } as AuthContextData,
      request: new Request(`https://example.com${path}`, {
        method,
        headers: { origin, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    } as Parameters<typeof onRequestGet>[0];
  }
  return { db, sqlite, context };
}
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5QAAAABJRU5ErkJggg==";
describe("member profiles", () => {
  it("saves only the caller's profile and shares name/photo/bio without email", async () => {
    const { sqlite, context } = fixture();
    try {
      const response = await onRequestPatch(
        context("PATCH", {
          userId: "bob",
          displayName: "映画好き",
          bio: "コメディが好き",
          avatar: png,
        }),
      );
      expect(response.status).toBe(200);
      const profile: MemberProfile = await response.json();
      expect(profile.displayName).toBe("映画好き");
      expect(profile.avatarUrl).toContain("userId=alice&v=");
      expect(
        sqlite.prepare("SELECT user_id FROM member_profiles").all(),
      ).toEqual([{ user_id: "alice" }]);
      const data: SharingResponse = await (await sharing(context())).json();
      const alice = data.members.find((m) => m.userId === "alice")!;
      expect(alice).toMatchObject({
        name: "映画好き",
        bio: "コメディが好き",
        avatarUrl: profile.avatarUrl,
      });
      expect(JSON.stringify(data.members)).not.toContain("@example.com");
      const image = await avatarGet(
        context("GET", undefined, "bob", profile.avatarUrl!),
      );
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(image.headers.get("x-content-type-options")).toBe("nosniff");
      expect(image.headers.get("cache-control")).toBe("private, no-store");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(
        Uint8Array.from(atob(png.split(",")[1]), (c) => c.charCodeAt(0)),
      );
      sqlite.exec("UPDATE users SET status='disabled' WHERE id='alice'");
      expect(
        (await avatarGet(context("GET", undefined, "bob", profile.avatarUrl!)))
          .status,
      ).toBe(404);
    } finally {
      sqlite.close();
    }
  });
  it("keeps the photo on text-only updates and removes it explicitly", async () => {
    const { sqlite, context } = fixture();
    try {
      const initial: MemberProfile = await (
        await onRequestPatch(
          context("PATCH", { displayName: "Alice", bio: "", avatar: png }),
        )
      ).json();
      const updated: MemberProfile = await (
        await onRequestPatch(
          context("PATCH", { displayName: "Alice 2", bio: "new" }),
        )
      ).json();
      expect(updated.avatarUrl).toBe(initial.avatarUrl);
      const removed: MemberProfile = await (
        await onRequestPatch(
          context("PATCH", { displayName: "Alice 2", bio: "", avatar: null }),
        )
      ).json();
      expect(removed.avatarUrl).toBeNull();
      expect((await avatarGet(context())).status).toBe(404);
    } finally {
      sqlite.close();
    }
  });
  it("rejects cross-origin writes, public access, missing and disabled users", async () => {
    const { sqlite, context } = fixture();
    const body = { displayName: "Alice", bio: "" };
    try {
      expect(
        (
          await onRequestPatch(
            context(
              "PATCH",
              body,
              "alice",
              "/api/account/profile",
              "https://evil.example",
            ),
          )
        ).status,
      ).toBe(403);
      for (const user of ["", "missing", "legacy-local"]) {
        expect(
          (await onRequestPatch(context("PATCH", body, user))).status,
        ).toBe(403);
        expect((await avatarGet(context("GET", undefined, user))).status).toBe(
          403,
        );
      }
      const publicCtx = context("PATCH", body);
      publicCtx.env.PUBLIC_MODE = "true";
      expect((await onRequestPatch(publicCtx)).status).toBe(403);
      expect((await avatarGet(publicCtx)).status).toBe(403);
      expect((await onRequestGet(publicCtx)).status).toBe(403);
      sqlite.exec("UPDATE users SET status='disabled' WHERE id='alice'");
      expect((await onRequestPatch(context("PATCH", body))).status).toBe(403);
    } finally {
      sqlite.close();
    }
  });
  it("rejects malformed, oversized, executable and mislabeled images", async () => {
    const { sqlite, context } = fixture();
    try {
      for (const avatar of [
        "https://remote.example/photo.png",
        "data:image/svg+xml;base64,PHN2Zz4=",
        "data:image/png;base64," + btoa("<html>not a photo</html>"),
        123,
      ]) {
        expect(
          (
            await onRequestPatch(
              context("PATCH", { displayName: "A", bio: "", avatar }),
            )
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await onRequestPatch(
            context("PATCH", {
              displayName: "A",
              bio: "",
              avatar: "a".repeat(200 * 1024),
            }),
          )
        ).status,
      ).toBe(413);
      for (const displayName of [" ", "a".repeat(41), "A\nB"])
        expect(
          (await onRequestPatch(context("PATCH", { displayName, bio: "" })))
            .status,
        ).toBe(400);
      expect(
        (
          await onRequestPatch(
            context("PATCH", { displayName: "A", bio: "a".repeat(161) }),
          )
        ).status,
      ).toBe(400);
      expect(
        sqlite.prepare("SELECT COUNT(*) AS n FROM member_profiles").get()?.n,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
