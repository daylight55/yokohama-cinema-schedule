import { describe, expect, it } from "vitest";
import { resolveShowingDateRange } from "../functions/api/showings";

describe("showing date ranges", () => {
  it("uses today for a request without dates", () => {
    expect(
      resolveShowingDateRange(new URLSearchParams(), "2026-07-29"),
    ).toEqual({
      date: "2026-07-29",
      through: "2026-07-29",
    });
  });

  it("accepts a single date and a seven-day range", () => {
    expect(
      resolveShowingDateRange(
        new URLSearchParams({ date: "2026-07-30" }),
        "2026-07-29",
      ),
    ).toEqual({
      date: "2026-07-30",
      through: "2026-07-30",
    });
    expect(
      resolveShowingDateRange(
        new URLSearchParams({
          date: "2026-07-29",
          through: "2026-08-04",
        }),
        "2026-07-29",
      ),
    ).toEqual({
      date: "2026-07-29",
      through: "2026-08-04",
    });
  });

  it("rejects reversed, oversized, and malformed ranges", () => {
    expect(
      resolveShowingDateRange(
        new URLSearchParams({
          date: "2026-07-29",
          through: "2026-07-28",
        }),
        "2026-07-29",
      ),
    ).toBeNull();
    expect(
      resolveShowingDateRange(
        new URLSearchParams({
          date: "2026-07-29",
          through: "2026-08-05",
        }),
        "2026-07-29",
      ),
    ).toBeNull();
    expect(
      resolveShowingDateRange(
        new URLSearchParams({
          date: "July-29",
          through: "2026-08-04",
        }),
        "2026-07-29",
      ),
    ).toBeNull();
    expect(
      resolveShowingDateRange(
        new URLSearchParams({ date: "2026-02-30" }),
        "2026-07-29",
      ),
    ).toBeNull();
  });
});
