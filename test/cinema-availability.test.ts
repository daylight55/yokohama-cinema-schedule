import { describe, expect, it } from "vitest";
import {
  activeDatesForCinema,
  isCinemaActiveOn,
} from "../shared/cinema-availability";

describe("cinema active period", () => {
  it("keeps a cinema without an end date active", () => {
    expect(isCinemaActiveOn({ activeUntil: null }, "2099-12-31")).toBe(true);
  });

  it("includes the active-until date", () => {
    expect(
      isCinemaActiveOn({ activeUntil: "2026-09-30" }, "2026-09-30"),
    ).toBe(true);
  });

  it("excludes dates after active-until", () => {
    expect(
      isCinemaActiveOn({ activeUntil: "2026-09-30" }, "2026-10-01"),
    ).toBe(false);
  });

  it("clips a collection window at active-until", () => {
    expect(
      activeDatesForCinema(
        ["2026-09-29", "2026-09-30", "2026-10-01"],
        "2026-09-30",
      ),
    ).toEqual(["2026-09-29", "2026-09-30"]);
  });
});
