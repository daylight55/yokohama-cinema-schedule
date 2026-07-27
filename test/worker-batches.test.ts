import { describe, expect, it } from "vitest";
import {
  normalizeShowingMovieTitle,
  parseSourceBatch,
  sourceBatchForCron,
} from "../worker/src/index";

describe("worker source batches", () => {
  it("uses the first batch for minute 7 cron triggers", () => {
    expect(sourceBatchForCron("7 0,3,6,9,12,15,21 * * *")).toBe(0);
  });

  it("uses the second batch for minute 17 cron triggers", () => {
    expect(sourceBatchForCron("17 0,3,6,9,12,15,21 * * *")).toBe(1);
  });

  it("accepts only explicit manual batch values", () => {
    expect(parseSourceBatch("0")).toBe(0);
    expect(parseSourceBatch("1")).toBe(1);
    expect(parseSourceBatch(null)).toBeNull();
    expect(parseSourceBatch("all")).toBeNull();
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
});
