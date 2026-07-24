import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL_MODE,
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
});
