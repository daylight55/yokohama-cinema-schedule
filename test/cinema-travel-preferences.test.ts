import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL_MODE,
  isCustomDurationMinutes,
  isTravelMode,
} from "../functions/_lib/cinema-travel-preferences";

describe("cinema travel preferences", () => {
  it("uses transit as the private default", () => {
    expect(DEFAULT_TRAVEL_MODE).toBe("transit");
  });

  it.each(["walking", "transit", "bus", "bicycle"])(
    "accepts the supported %s mode",
    (travelMode) => {
      expect(isTravelMode(travelMode)).toBe(true);
    },
  );

  it.each(["car", "", null, 1])("rejects unsupported mode %s", (travelMode) => {
    expect(isTravelMode(travelMode)).toBe(false);
  });

  it.each([1, 25, 1440])(
    "accepts a custom duration of %i minutes",
    (durationMinutes) => {
      expect(isCustomDurationMinutes(durationMinutes)).toBe(true);
    },
  );

  it.each([0, 1441, 1.5, "30", null])(
    "rejects an invalid custom duration of %s",
    (durationMinutes) => {
      expect(isCustomDurationMinutes(durationMinutes)).toBe(false);
    },
  );
});
