import { describe, expect, it } from "vitest";
import {
  applyCustomDuration,
  estimateRoute,
  TRANSIT_BUFFER_MINUTES,
  TRANSIT_STATION_WALK_MINUTES,
} from "../functions/api/routes";
import type { Cinema, TravelMode } from "../shared/types";

const cinema: Cinema = {
  id: "test-cinema",
  name: "テスト映画館",
  shortName: "テスト",
  area: "yokohama",
  areaLabel: "横浜駅",
  address: "横浜市",
  latitude: 35.465,
  longitude: 139.622,
  sourceUrl: "https://example.com",
  activeUntil: null,
  approval: "private_only",
};

describe("route estimates", () => {
  it.each<TravelMode>(["walking", "transit", "bus", "bicycle"])(
    "returns a positive %s estimate",
    (travelMode) => {
      const route = estimateRoute(35.46, 139.61, cinema, travelMode);

      expect(route).toMatchObject({
        cinemaId: cinema.id,
        mode: "estimate",
        provider: "estimate",
        travelMode,
      });
      expect(route.distanceMeters).toBeGreaterThan(0);
      expect(route.durationMinutes).toBeGreaterThan(0);
      expect(route.accessMinutes).toBeGreaterThanOrEqual(0);
      expect(route.bufferMinutes).toBeGreaterThanOrEqual(0);
    },
  );

  it("includes both station walks and a ten-minute buffer for transit", () => {
    const route = estimateRoute(
      cinema.latitude,
      cinema.longitude,
      cinema,
      "transit",
    );

    expect(route.accessMinutes).toBe(TRANSIT_STATION_WALK_MINUTES);
    expect(route.bufferMinutes).toBe(TRANSIT_BUFFER_MINUTES);
    expect(route.durationMinutes).toBe(25);
  });

  it("applies a different travel profile for each mode", () => {
    const routes = new Map(
      (["walking", "transit", "bus", "bicycle"] as const).map(
        (travelMode) => [
          travelMode,
          estimateRoute(35.46, 139.61, cinema, travelMode),
        ],
      ),
    );

    expect(routes.get("walking")!.durationMinutes).toBeGreaterThan(
      routes.get("bicycle")!.durationMinutes,
    );
    expect(routes.get("transit")!.durationMinutes).not.toBe(
      routes.get("walking")!.durationMinutes,
    );
    expect(routes.get("bus")!.durationMinutes).not.toBe(
      routes.get("bicycle")!.durationMinutes,
    );
  });

  it("uses a user-specified cinema duration while keeping the calculated estimate", () => {
    const calculated = estimateRoute(35.46, 139.61, cinema, "transit");
    const customized = applyCustomDuration(calculated, 37);

    expect(customized.durationMinutes).toBe(37);
    expect(customized.customDurationMinutes).toBe(37);
    expect(customized.calculatedDurationMinutes).toBe(
      calculated.durationMinutes,
    );
  });

  it("leaves the calculated estimate unchanged when no custom duration is set", () => {
    const calculated = estimateRoute(35.46, 139.61, cinema, "transit");

    expect(applyCustomDuration(calculated, null)).toBe(calculated);
  });
});
