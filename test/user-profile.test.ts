import { describe, expect, it } from "vitest";
import { normalizeHomeCoordinates } from "../functions/_lib/user-profile";

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
