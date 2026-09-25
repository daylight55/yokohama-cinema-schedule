import { afterEach, expect, it, vi } from "vitest";
import { checkedFetch } from "../worker/src/index";
import { parseTjoySchedule } from "../worker/src/parsers/tjoy";
import {
  readLimitedJson,
  validateCollectionPayload,
  validBearer,
} from "../worker/src/ingest";
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
it("limits ingestion to authorized requests, current dates and the T-Joy sources", async () => {
  expect(
    await validBearer(new Request("https://worker/ingest"), "secret"),
  ).toBe(false);
  expect(
    await validBearer(
      new Request("https://worker/ingest", {
        headers: { authorization: "Bearer secret" },
      }),
      "secret",
    ),
  ).toBe(true);
  expect(() => validateCollectionPayload({ sourceId: "movil" })).toThrow(
    "source",
  );
  expect(() =>
    validateCollectionPayload({
      sourceId: "tjoy-yokohama",
      dates: ["2020-01-01"],
    }),
  ).toThrow("dates");
  await expect(
    readLimitedJson(
      new Request("https://worker/ingest", {
        method: "POST",
        body: "too large",
      }),
      2,
    ),
  ).rejects.toThrow("body_too_large");
});
