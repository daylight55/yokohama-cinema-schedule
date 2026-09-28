import { describe, expect, it, vi } from "vitest";
import { reusableDateFormatter } from "../src/dateFormatter";
import { createPerformanceMetrics } from "../src/performanceMetrics";
describe("frontend performance budgets", () => {
  it("formats 2000 screening times with one Intl allocation and respects locale changes", () => {
    const original = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) {
      return new original(...args);
    });
    try {
      let locale = "ja-JP";
      const formatter = reusableDateFormatter(
        { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
        () => locale,
      );
      const date = new Date("2026-09-27T03:45:00Z");
      for (let i = 0; i < 2000; i++)
        expect(formatter.format(date)).toBe("12:45");
      expect(spy).toHaveBeenCalledTimes(1);
      locale = "en-GB";
      expect(formatter.format(date)).toBe(
        new original("en-GB", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(date),
      );
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
  it("keeps fixed-size diagnostic data after 100000 events, no growing event history", () => {
    const metrics = createPerformanceMetrics();
    for (let i = 0; i < 100000; i++) metrics.record("longtask", 60);
    metrics.record("longtask", NaN);
    metrics.record("longtask", -1);
    metrics.record("long-animation-frame", 75);
    metrics.record("event", 24);
    metrics.commit();
    expect(metrics.snapshot()).toEqual({
      tasks: 100000,
      taskMs: 6000000,
      maxTaskMs: 60,
      frames: 1,
      maxFrameMs: 75,
      interactions: 1,
      maxInteractionMs: 24,
      commits: 1,
    });
  });
});
