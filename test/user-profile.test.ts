import { describe, expect, it, vi } from "vitest";
import {
  getScheduleCollapseMinutes,
  isScheduleCollapseMinutes,
  normalizeHomeCoordinates,
} from "../functions/_lib/user-profile";

describe("user home profile", () => {
  it("stores only the coordinate precision needed for minute estimates", () => {
    expect(
      normalizeHomeCoordinates(35.4387042, 139.6457214),
    ).toEqual({
      latitude: 35.4387,
      longitude: 139.6457,
    });
  });

  it.each([
    [91, 139],
    [-91, 139],
    [35, 181],
    [35, -181],
    ["not-a-number", 139],
    [35, null],
  ])("rejects invalid home coordinates %s, %s", (latitude, longitude) => {
    expect(normalizeHomeCoordinates(latitude, longitude)).toBeNull();
  });
});

describe("schedule collapse preference", () => {
  it.each([0, 30, 60])("accepts %i minutes", (value) => {
    expect(isScheduleCollapseMinutes(value)).toBe(true);
  });

  it.each([-1, 1, 15, 45, 90, "60", null, undefined])(
    "rejects unsupported value %s",
    (value) => {
      expect(isScheduleCollapseMinutes(value)).toBe(false);
    },
  );

  it("defaults to one hour when no cloud preference exists", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const db = {
      prepare: vi.fn(() => ({ first })),
    } as unknown as D1Database;

    await expect(getScheduleCollapseMinutes(db)).resolves.toBe(60);
  });

  it("falls back to one hour when the stored value is invalid", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({ preference_value: "unexpected" });
    const db = {
      prepare: vi.fn(() => ({ first })),
    } as unknown as D1Database;

    await expect(getScheduleCollapseMinutes(db)).resolves.toBe(60);
  });
});
