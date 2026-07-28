import { describe, expect, it } from "vitest";
import { CINEMAS } from "../shared/cinemas";
import {
  configuredSourceIds,
  isFailedSourceRetryCron,
  normalizeShowingMovieTitle,
  parseSourceBatch,
  sourceDateOutcomes,
  sourceIdsForBatch,
  sourceBatchForCron,
} from "../worker/src/index";

describe("worker source batches", () => {
  it("uses the first batch for minute 7 cron triggers", () => {
    expect(sourceBatchForCron("7 21 * * *")).toBe(0);
  });

  it("uses the second batch for minute 17 cron triggers", () => {
    expect(sourceBatchForCron("17 21 * * *")).toBe(1);
  });

  it("uses third batch for minute 27 cron triggers", () => {
    expect(sourceBatchForCron("27 21 * * *")).toBe(2);
  });

  it("uses minute 47 only for failed-source retry", () => {
    expect(isFailedSourceRetryCron("47 3 * * *")).toBe(true);
    expect(isFailedSourceRetryCron("7 21 * * *")).toBe(false);
  });

  it("accepts only explicit manual batch values", () => {
    expect(parseSourceBatch("0")).toBe(0);
    expect(parseSourceBatch("1")).toBe(1);
    expect(parseSourceBatch("2")).toBe(2);
    expect(parseSourceBatch(null)).toBeNull();
    expect(parseSourceBatch("all")).toBeNull();
  });

  it("assigns every configured cinema to exactly one implemented source batch", () => {
    const cinemaIds = CINEMAS.map((cinema) => cinema.id).sort();
    const assignedSourceIds = ([0, 1, 2] as const).flatMap(
      sourceIdsForBatch,
    );

    expect(new Set(assignedSourceIds).size).toBe(assignedSourceIds.length);
    expect(assignedSourceIds.sort()).toEqual(cinemaIds);
    expect(configuredSourceIds().sort()).toEqual(cinemaIds);
  });

  it("stores a clean movie title while preserving the screening format", () => {
    const showing = normalizeShowingMovieTitle({
      sourceId: "test-source",
      cinemaId: "test-cinema",
      movieKey: "movie-1",
      title: "４ＤＸ　テスト映画（字幕）（ＰＧ１２）",
      imageUrl: null,
      startsAt: "2026-07-27T10:00:00.000Z",
      endsAt: "2026-07-27T12:00:00.000Z",
      screen: "1",
      format: "4DX / 字幕",
      bookingUrl: "https://example.com",
      purchasable: true,
    });

    expect(showing.title).toBe("テスト映画");
    expect(showing.format).toBe("4DX / 字幕");
    expect(showing.movieKey).toBe("movie-1");
  });

  it("reports each requested date as published, not published, or failed", () => {
    const showing = {
      sourceId: "test-source",
      cinemaId: "test-cinema",
      movieKey: "movie-1",
      title: "テスト映画",
      imageUrl: null,
      startsAt: "2026-07-28T01:00:00.000Z",
      endsAt: null,
      screen: null,
      format: null,
      bookingUrl: "https://example.com",
      purchasable: null,
    };
    const outcomes = sourceDateOutcomes(
      ["2026-07-28", "2026-07-29", "2026-07-30"],
      [showing],
      new Map([["2026-07-30", "HTTP 503"]]),
    );

    expect(outcomes).toEqual([
      { date: "2026-07-28", status: "published", count: 1 },
      { date: "2026-07-29", status: "not_published", count: 0 },
      {
        date: "2026-07-30",
        status: "error",
        count: 0,
        error: "HTTP 503",
      },
    ]);
  });
});
