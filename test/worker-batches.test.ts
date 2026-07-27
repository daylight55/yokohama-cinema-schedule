import { describe, expect, it } from "vitest";
import {
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
});
