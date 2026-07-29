import { describe, expect, it, vi } from "vitest";
import {
  getDepartureLocation,
  getScheduleCollapseMinutes,
  isScheduleCollapseMinutes,
  normalizeDepartureCoordinates,
} from "../functions/_lib/user-profile";

const PROFILE_ENCRYPTION_KEY = btoa("a".repeat(32));

describe("user departure profile", () => {
  it("stores only the coordinate precision needed for minute estimates", () => {
    expect(
      normalizeDepartureCoordinates(35.4387042, 139.6457214),
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
  ])("rejects invalid departure coordinates %s, %s", (latitude, longitude) => {
    expect(normalizeDepartureCoordinates(latitude, longitude)).toBeNull();
  });

  it("migrates a legacy plaintext row to encrypted D1 columns", async () => {
    const updateBind = vi.fn(() => ({
      run: async () => ({ meta: { changes: 1 } }),
    }));
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT home_latitude")) {
          return {
            bind: () => ({
              first: async () => ({
                home_latitude: 35.4387,
                home_longitude: 139.6457,
                home_updated_at: "2026-07-29T00:00:00.000Z",
                departure_ciphertext: null,
                departure_iv: null,
                departure_salt: null,
                departure_encryption_version: null,
              }),
            }),
          };
        }
        return { bind: updateBind };
      }),
    } as unknown as D1Database;

    await expect(
      getDepartureLocation(
        db,
        PROFILE_ENCRYPTION_KEY,
        "user-a",
      ),
    ).resolves.toEqual({
      latitude: 35.4387,
      longitude: 139.6457,
      updatedAt: "2026-07-29T00:00:00.000Z",
    });

    const updateSql = vi
      .mocked(db.prepare)
      .mock.calls.map(([sql]) => String(sql))
      .find((sql) => sql.includes("UPDATE user_profiles"));
    expect(updateSql).toContain("home_latitude = 0");
    expect(updateSql).toContain("home_longitude = 0");
    expect(updateBind).toHaveBeenCalledOnce();
    const storedValues = updateBind.mock.calls[0];
    expect(storedValues).toHaveLength(5);
    expect(storedValues).not.toContain(35.4387);
    expect(storedValues).not.toContain(139.6457);
    expect(storedValues.at(-1)).toBe("user-a");
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
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first })),
      })),
    } as unknown as D1Database;

    await expect(getScheduleCollapseMinutes(db)).resolves.toBe(60);
  });

  it("falls back to one hour when the stored value is invalid", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({ preference_value: "unexpected" });
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first })),
      })),
    } as unknown as D1Database;

    await expect(getScheduleCollapseMinutes(db)).resolves.toBe(60);
  });
});
