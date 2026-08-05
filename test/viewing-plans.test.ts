import { describe, expect, it } from "vitest";
import type { PagesEnv } from "../functions/_lib/env";
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost,
} from "../functions/api/viewing-plans";

interface FakeResult {
  success: boolean;
  meta?: { changes?: number };
}

interface PreparedCall {
  sql: string;
  values: unknown[];
}

function fakeDatabase(options: {
  showing?: Record<string, unknown> | null;
  plans?: Record<string, unknown>[];
  deleteChanges?: number;
}) {
  const calls: PreparedCall[] = [];
  const DB = {
    prepare(sql: string) {
      const call: PreparedCall = { sql, values: [] };
      calls.push(call);
      const statement = {
        bind(...values: unknown[]) {
          call.values = values;
          return statement;
        },
        async first<T>() {
          if (sql.includes("FROM showings")) {
            return (options.showing ?? null) as T | null;
          }
          return null;
        },
        async all<T>() {
          return {
            success: true,
            results: (options.plans ?? []) as T[],
          };
        },
        async run(): Promise<FakeResult> {
          return {
            success: true,
            meta: {
              changes: sql.startsWith("DELETE")
                ? (options.deleteChanges ?? 1)
                : 1,
            },
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { DB, calls };
}

function context(
  request: Request,
  DB: D1Database,
  userId = "user-1",
) {
  return {
    request,
    env: { DB } as PagesEnv,
    data: {
      userId,
      authUser: {
        id: userId,
        email: null,
        role: "member",
        status: "active",
      },
      legacySession: false,
    },
  } as Parameters<typeof onRequestGet>[0];
}

const futureShowing = {
  showing_id: "showing-1",
  movie_key: "movie-1",
  title: "テスト映画",
  cinema_id: "cinema-1",
  cinema_name: "テストシネマ",
  cinema_short_name: "テスト",
  starts_at: "2099-07-29T10:00:00.000Z",
  ends_at: "2099-07-29T12:00:00.000Z",
  screen: "シアター1",
  format: "字幕",
  booking_url: "https://cinema.example/showing-1",
  reserved_at: null,
};

const savedPlanRow = {
  ...futureShowing,
  created_at: "2026-07-29T00:00:00.000Z",
  updated_at: "2026-07-29T00:00:00.000Z",
};

describe("viewing plans API", () => {
  it("loads only the signed-in user's plans in chronological order", async () => {
    const { DB, calls } = fakeDatabase({ plans: [savedPlanRow] });
    const response = await onRequestGet(
      context(new Request("https://example.com/api/viewing-plans"), DB),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      plans: [
        {
          showingId: "showing-1",
          title: "テスト映画",
          cinemaName: "テストシネマ",
          reservedAt: null,
        },
      ],
    });
    expect(calls[0].sql).toContain("ORDER BY starts_at ASC");
    expect(calls[0].values).toEqual(["user-1"]);
  });

  it("uses the authoritative showing row and saves idempotently", async () => {
    const { DB, calls } = fakeDatabase({ showing: futureShowing });
    const response = await onRequestPost(
      context(
        new Request("https://example.com/api/viewing-plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            showingId: "showing-1",
            title: "偽タイトル",
          }),
        }),
        DB,
      ),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      showingId: "showing-1",
      title: "テスト映画",
    });
    const insert = calls.find((call) =>
      call.sql.includes("INSERT INTO viewing_plans"),
    );
    expect(insert?.sql).toContain("ON CONFLICT(user_id, showing_id)");
    expect(insert?.values).toContain("テスト映画");
    expect(insert?.values).not.toContain("偽タイトル");
  });

  it("rejects missing and already-started showings", async () => {
    const missing = fakeDatabase({ showing: null });
    const missingResponse = await onRequestPost(
      context(
        new Request("https://example.com/api/viewing-plans", {
          method: "POST",
          body: JSON.stringify({ showingId: "missing" }),
        }),
        missing.DB,
      ),
    );
    expect(missingResponse.status).toBe(404);

    const started = fakeDatabase({
      showing: {
        ...futureShowing,
        starts_at: "2020-01-01T00:00:00.000Z",
      },
    });
    const startedResponse = await onRequestPost(
      context(
        new Request("https://example.com/api/viewing-plans", {
          method: "POST",
          body: JSON.stringify({ showingId: "showing-1" }),
        }),
        started.DB,
      ),
    );
    expect(startedResponse.status).toBe(409);
  });

  it("deletes only the signed-in user's exact showing", async () => {
    const { DB, calls } = fakeDatabase({ deleteChanges: 1 });
    const response = await onRequestDelete(
      context(
        new Request(
          "https://example.com/api/viewing-plans?id=showing-1",
          { method: "DELETE" },
        ),
        DB,
        "user-2",
      ),
    );

    expect(response.status).toBe(204);
    expect(calls[0].values).toEqual(["showing-1", "user-2"]);
  });

  it("updates reservation state only for the signed-in user's plan", async () => {
    const { DB, calls } = fakeDatabase({ deleteChanges: 1 });
    const response = await onRequestPatch(
      context(
        new Request(
          "https://example.com/api/viewing-plans?id=showing-1",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reserved: true }),
          },
        ),
        DB,
        "user-1",
      ),
    );

    expect(response.status).toBe(204);
    expect(calls[0].sql).toContain("SET reserved_at = ?");
    expect(calls[0].values[2]).toBe("showing-1");
    expect(calls[0].values[3]).toBe("user-1");
  });

  it("rejects reservation updates without a boolean", async () => {
    const { DB } = fakeDatabase({ deleteChanges: 1 });
    const response = await onRequestPatch(
      context(
        new Request(
          "https://example.com/api/viewing-plans?id=showing-1",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reserved: "yes" }),
          },
        ),
        DB,
      ),
    );

    expect(response.status).toBe(400);
  });
});
