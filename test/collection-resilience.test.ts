import { afterEach, expect, it, vi } from "vitest";
import { checkedFetch, fetchTjoy, refreshBatch } from "../worker/src/index";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";
import { validBearer } from "../worker/src/request-auth";
import { testDatabase } from "./helpers/sqlite-d1";
import { dateRange } from "../shared/date";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([403, 429])(
  "does not retry HTTP %s and releases its response body",
  async (status) => {
    const cancel = vi.fn();
    const fetcher = vi.fn(
      async () => new Response(new ReadableStream({ cancel }), { status }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(checkedFetch("https://example.com")).rejects.toThrow(
      `HTTP ${status}`,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  },
);
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
  vi.useFakeTimers();
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
  const pending = fetchTjoy(
    ["2026-09-25", "2026-09-26"],
    "tjoy-yokohama",
    "tjoy-yokohama",
    "https://tjoy.jp/t-joy_yokohama",
    browser,
  );
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(quickAction).toHaveBeenCalledTimes(2);
  expect(result.dateErrors.has("2026-09-25")).toBe(true);
  expect(result.dateErrors.has("2026-09-26")).toBe(false);
});

const collectionDates = dateRange("2026-09-25", 7);
function collect(browser?: BrowserRun) {
  return fetchTjoy(
    collectionDates,
    "tjoy-yokohama",
    "tjoy-yokohama",
    "https://tjoy.jp/t-joy_yokohama",
    browser,
  );
}
it.each([403, 429])(
  "stops all later dates after HTTP %s for direct fetch and Browser Run",
  async (status) => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetcher);
    expect((await collect()).dateErrors.size).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const quickAction = vi.fn(async () => new Response(null, { status }));
    expect(
      (await collect({ quickAction } as unknown as BrowserRun)).dateErrors.size,
    ).toBe(7);
    expect(quickAction).toHaveBeenCalledTimes(1);
  },
);
it.each(["network", "server"])(
  "caps actual failed HTTP attempts at five across dates and inner retries: %s",
  async (kind) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => {
      if (kind === "network") throw new Error("connection reset");
      return new Response(null, { status: 503 });
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = collect();
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(result.dateErrors.size).toBe(7);
    expect(result.dateErrors.get(collectionDates[2])).toContain(
      "5 failed attempts",
    );
    expect(result.dateErrors.get(collectionDates[6])).toContain(
      "5 failed attempts",
    );
  },
);
it.each(["server", "parser"])(
  "caps Browser Run failures at five, including %s errors",
  async (kind) => {
    vi.useFakeTimers();
    const quickAction = vi.fn(async () =>
      kind === "server"
        ? new Response(null, { status: 503 })
        : Response.json({
            success: true,
            result: "<html>Access denied</html>",
          }),
    );
    const pending = collect({ quickAction } as unknown as BrowserRun);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(quickAction).toHaveBeenCalledTimes(5);
    expect(result.dateErrors.size).toBe(7);
    expect(result.dateErrors.get(collectionDates[6])).toContain(
      "5 failed attempts",
    );
  },
);
it("does not reset the failure budget when a retry succeeds", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (input: string) => {
    if (fetcher.mock.calls.length % 2 === 1)
      return new Response(null, { status: 503 });
    const date = new URL(input).searchParams.get("date");
    return new Response(
      `<div id="film"><a class="calendar-active calendar-item" data-date="${date}"></a><p class="text-notify">スケジュールは調整中です。</p></div>`,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const pending = collect();
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(fetcher).toHaveBeenCalledTimes(9); // Four recovered dates, then fifth failure stops.
  expect(result.dateErrors.size).toBe(3);
});
it("includes optional image requests in the same five-failure budget", async () => {
  vi.useFakeTimers();
  const { db, sqlite } = testDatabase();
  try {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const pending = refreshBatch(
      { DB: db, SCHEDULE_DAYS: "7" },
      1,
      new Set(["united-minatomirai"]),
    );
    await vi.runAllTimersAsync();
    expect((await pending).failed).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM source_date_health WHERE status='error'",
        )
        .get()?.n,
    ).toBe(7);
  } finally {
    sqlite.close();
  }
});
it("keeps budgets separate between collections", async () => {
  const quickAction = vi.fn(async () => new Response(null, { status: 429 }));
  const browser = { quickAction } as unknown as BrowserRun;
  await collect(browser);
  await collect(browser);
  expect(quickAction).toHaveBeenCalledTimes(2);
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
  vi.useFakeTimers({ toFake: ["Date"] });
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
