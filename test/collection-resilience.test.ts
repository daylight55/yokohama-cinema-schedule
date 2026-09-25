import { afterEach, expect, it, vi } from "vitest";
import { checkedFetch, fetchTjoy, refreshBatch } from "../worker/src/index";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";
import { validBearer } from "../worker/src/request-auth";
import { testDatabase } from "./helpers/sqlite-d1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does not retry forbidden pages and releases their response body", async () => {
  const cancel = vi.fn();
  const fetcher = vi.fn(
    async () => new Response(new ReadableStream({ cancel }), { status: 403 }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(checkedFetch("https://example.com")).rejects.toThrow("HTTP 403");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("retries a transient error once and supplies a bounded timeout", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response("ok"));
  vi.stubGlobal("fetch", fetcher);
  const result = checkedFetch("https://example.com");
  await vi.runAllTimersAsync();
  expect(await (await result).text()).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it("rejects a challenge/error HTML page and wrong-date schedule as parse errors", () => {
  expect(() =>
    parseTjoySchedule(
      "<html>Access denied</html>",
      "2026-09-25",
      "tjoy-yokohama",
      "tjoy-yokohama",
      "https://tjoy.jp",
    ),
  ).toThrow("markup");
  expect(() =>
    parseTjoySchedule(
      '<a class="calendar-active" data-date="2026-09-24"></a>',
      "2026-09-25",
      "tjoy-yokohama",
      "tjoy-yokohama",
      "https://tjoy.jp",
    ),
  ).toThrow("different");
});
it("keeps manual refresh restricted to its dedicated secret", async () => {
  expect(
    await validBearer(new Request("https://worker/refresh"), "secret"),
  ).toBe(false);
  expect(
    await validBearer(
      new Request("https://worker/refresh", {
        headers: { authorization: "Bearer secret" },
      }),
      "secret",
    ),
  ).toBe(true);
});
it("uses Browser Run and isolates one date failure from the remaining dates", async () => {
  const quickAction = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        result:
          '<div id="film"><a class="calendar-active calendar-item" data-date="2026-09-26"></a><p class="text-notify">スケジュールは調整中です。</p></div>',
      }),
    );
  const browser = { quickAction } as unknown as BrowserRun;
  const result = await fetchTjoy(
    ["2026-09-25", "2026-09-26"],
    "tjoy-yokohama",
    "tjoy-yokohama",
    "https://tjoy.jp/t-joy_yokohama",
    browser,
  );
  expect(quickAction).toHaveBeenCalledTimes(2);
  expect(result.dateErrors.has("2026-09-25")).toBe(true);
  expect(result.dateErrors.has("2026-09-26")).toBe(false);
});

const film = `<section class="section-container"><h2 class="js-title-film">テスト映画</h2><div class="schedule-box"><p class="schedule-time">18:10 ～ 20:20</p></div></section>`;
const parse = (html: string) =>
  parseTjoySchedule(
    html,
    "2026-09-26",
    "tjoy-yokohama",
    "tjoy-yokohama",
    "https://tjoy.jp",
  );
it.each([
  film.replace("18:10 ～ 20:20", "未取得"),
  film.replace('class="js-title-film"', 'class="changed-title"'),
  film.replace('class="schedule-box"', 'class="changed-box"'),
  film.replace('class="section-container"', 'class="changed-section"'),
])(
  "rejects partial schedules instead of replacing stored data with missing rows",
  (broken) => {
    expect(() => parse(`<div id="film">${film}${broken}</div>`)).toThrow();
  },
);
it("distinguishes an unpublished schedule from a truncated calendar-only response", () => {
  const calendar =
    '<a class="calendar-active calendar-item" data-date="2026-09-26"></a>';
  expect(() => parse(`<div id="film">${calendar}</div>`)).toThrow();
  expect(
    parse(
      `<div id="film">${calendar}<p class="text-notify">スケジュールは調整中です。</p></div>`,
    ),
  ).toEqual([]);
});
it("does not import event listings from other tabs", () => {
  expect(
    parse(`<div id="film">${film}</div><div id="event">${film}</div>`),
  ).toHaveLength(1);
});
it("preserves stored showings and search rows for a malformed date while refreshing other dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T00:00:00Z"));
  const { db, sqlite } = testDatabase();
  try {
    let broken = false;
    const quickAction = vi.fn(
      async (_action: string, options: { url: string }) => {
        const date = new URL(options.url).searchParams.get("date");
        return Response.json({
          success: true,
          result: `<div id="film"><a class="calendar-active calendar-item" data-date="${date}"></a>${film}${broken && date === "2026-09-25" ? film.replace("18:10 ～ 20:20", "未取得") : ""}</div>`,
        });
      },
    );
    const env = {
      DB: db,
      SCHEDULE_DAYS: "2",
      BROWSER: { quickAction } as unknown as BrowserRun,
    };
    const sources = new Set(["tjoy-yokohama"]);
    expect((await refreshBatch(env, 0, sources)).succeeded).toBe(1);
    const saved = sqlite
      .prepare("SELECT * FROM showings WHERE starts_at LIKE '2026-09-25%'")
      .all();
    const search = sqlite
      .prepare(
        "SELECT * FROM showing_search WHERE schedule_date = '2026-09-25'",
      )
      .all();
    broken = true;
    vi.setSystemTime(new Date("2026-09-25T01:00:00Z"));
    expect((await refreshBatch(env, 0, sources)).failed).toBe(1);
    expect(saved).toHaveLength(1);
    expect(
      sqlite
        .prepare("SELECT * FROM showings WHERE starts_at LIKE '2026-09-25%'")
        .all(),
    ).toEqual(saved);
    expect(
      sqlite
        .prepare(
          "SELECT * FROM showing_search WHERE schedule_date = '2026-09-25'",
        )
        .all(),
    ).toEqual(search);
    expect(
      sqlite
        .prepare(
          "SELECT status FROM source_date_health WHERE schedule_date = '2026-09-25'",
        )
        .get()?.status,
    ).toBe("error");
    expect(
      sqlite
        .prepare(
          "SELECT fetched_at FROM showings WHERE starts_at LIKE '2026-09-26%'",
        )
        .get()?.fetched_at,
    ).toBe("2026-09-25T01:00:00.000Z");
  } finally {
    sqlite.close();
  }
});
