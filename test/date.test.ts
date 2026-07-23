import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  jstEndToIso,
  jstLocalToIso,
} from "../shared/date";

describe("JST date helpers", () => {
  it("builds a stable date range", () => {
    expect(dateRange("2026-07-24", 3)).toEqual([
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("converts a local screening time to UTC", () => {
    expect(jstLocalToIso("2026-07-24", "18:30")).toBe(
      "2026-07-24T09:30:00.000Z",
    );
  });

  it("moves an after-midnight end time to the following day", () => {
    expect(jstEndToIso("2026-07-24", "23:40", "01:50")).toBe(
      "2026-07-24T16:50:00.000Z",
    );
  });
});
