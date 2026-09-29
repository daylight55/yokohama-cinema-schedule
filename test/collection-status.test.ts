import { normalizeReturnHash } from "../functions/auth/login";
import { expect, it, vi, afterEach } from "vitest";
import { loadCollectionStatus } from "../functions/api/collection-status";
import { testDatabase } from "./helpers/sqlite-d1";
import { refreshBatch } from "../worker/src/index";
import { appHashStateFromHash, hashForAppView } from "../src/lib";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("reports every active cinema/date, keeps retained data separate and never labels coverage complete", async () => {
  const { db, sqlite } = testDatabase();
  try {
    sqlite.exec("DELETE FROM cinemas");
    for (const [id, approval, until] of [
      ["a", "approved", null],
      ["b", "private_only", null],
      ["c", "approved", "2026-09-30"],
      ["d", "disabled", null],
      ["e", "approved", "2026-09-27"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,updated_at,approval,active_until) VALUES (?,?,'Test','yokohama','Test','Test',0,0,'https://example.com','',?,?)`,
        )
        .run(id, id, approval, until);
    }
    sqlite.exec(`INSERT INTO source_date_health VALUES ('a','2026-10-02','2026-09-27T23:00:00Z','2026-09-26T23:00:00Z','error',0,'HTTP 403 private URL');
    INSERT INTO source_date_health VALUES ('b','2026-10-02','2026-09-27T00:00:00Z','2026-09-27T00:00:00Z','published',1,NULL);
    INSERT INTO source_date_health VALUES ('a','2026-10-03','2026-09-27T23:00:00Z','2026-09-27T23:00:00Z','not_published',0,NULL);
    INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES ('saved','a','a','Film','Film','2026-10-01T15:30:00Z','https://example.com','2026-09-26T23:00:00Z');`);
    const result = await loadCollectionStatus(
      db,
      false,
      new Date("2026-09-28T00:00:00Z"),
    );
    expect(result.cinemas.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(result.cinemas[2].days).toHaveLength(3);
    expect(
      result.cinemas[0].days.find((d) => d.date === "2026-10-02"),
    ).toMatchObject({
      status: "error",
      stale: false,
      fetchedCount: 0,
      storedCount: 1,
      issue: "blocked",
      lastSuccessAt: "2026-09-26T23:00:00Z",
    });
    expect(result.cinemas[0].days[0].status).toBe("missing");
    expect(result.cinemas[1].days[4]).toMatchObject({
      status: "published",
      stale: true,
    });
    expect(result.cinemas[0].days[5]).toMatchObject({
      status: "not_published",
      stale: false,
    });
    expect(JSON.stringify(result)).not.toContain("private URL");
    expect(
      (
        await loadCollectionStatus(db, true, new Date("2026-09-28T00:00:00Z"))
      ).cinemas.map((c) => c.id),
    ).toEqual(["a", "c"]);
  } finally {
    sqlite.close();
  }
});
it("records a successful empty requested day without deleting earlier saved showtimes or requesting other dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  const quickAction = vi.fn(
    async (_action: string, _options: { url: string }) =>
      Response.json({
        success: true,
        result:
          '<div id="film"><a class="calendar-active calendar-item" data-date="2026-10-02"></a><p class="text-notify">スケジュールは調整中です。</p></div>',
      }),
  );
  try {
    await refreshBatch(
      { DB: db, BROWSER: { quickAction } as unknown as BrowserRun },
      0,
      new Set(["tjoy-yokohama"]),
      new Set(["2026-10-02"]),
    );
    sqlite.exec(
      `INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at) VALUES ('old','tjoy-yokohama','tjoy-yokohama','Film','Film','2026-10-02T10:00:00Z','https://example.com','2026-09-27T23:00:00Z');`,
    );
    const result = await refreshBatch(
      { DB: db, BROWSER: { quickAction } as unknown as BrowserRun },
      0,
      new Set(["tjoy-yokohama"]),
      new Set(["2026-10-02"]),
    );
    expect(result.failed).toBe(0);
    expect(quickAction).toHaveBeenCalledTimes(2);
    expect(quickAction.mock.calls[0][1].url).toContain("date=2026-10-02");
    expect(
      sqlite
        .prepare("SELECT status,showing_count FROM source_date_health")
        .all(),
    ).toEqual([{ status: "not_published", showing_count: 0 }]);
    expect(
      sqlite.prepare("SELECT id FROM showings WHERE id='old'").get(),
    ).toBeTruthy();
  } finally {
    sqlite.close();
  }
});
it("keeps the update-status date in direct links and browser history", () => {
  expect(
    appHashStateFromHash(
      hashForAppView("collectionStatus", { date: "2026-10-02" }),
    ),
  ).toMatchObject({ view: "collectionStatus", date: "2026-10-02" });
});

it("filters weekly Kino output to the requested Friday without shifting dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  const dates = [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ];
  const html =
    dates
      .map(
        (d) =>
          `<div class="schedule__day-btn"><button aria-label="${Number(d.slice(5, 7))}月${Number(d.slice(8))}日の上映"></button></div>`,
      )
      .join("") +
    dates
      .map(
        (_, i) =>
          `<div class="schedule__item"><div class="schedule__movie"><h2 class="schedule__title">Film ${i}</h2><div class="schedule__screen"><div class="schedule__time"><span class="schedule__start-time">19:00</span></div></div></div></div>`,
      )
      .join("");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(html)),
  );
  try {
    const result = await refreshBatch(
      { DB: db },
      1,
      new Set(["kino-minatomirai"]),
      new Set(["2026-10-02"]),
    );
    expect(result.sources[0].count).toBe(1);
    expect(
      sqlite.prepare("SELECT title, starts_at FROM showings").all(),
    ).toEqual([{ title: "Film 4", starts_at: "2026-10-02T10:00:00.000Z" }]);
  } finally {
    sqlite.close();
  }
});

it("retains only a safe status hash through password login", () => {
  expect(normalizeReturnHash("#collection-status?date=2026-10-02")).toBe(
    "#collection-status?date=2026-10-02",
  );
  expect(
    normalizeReturnHash(
      "#collection-status?date=2026-10-02&next=https://evil.test",
    ),
  ).toBe("");
});
