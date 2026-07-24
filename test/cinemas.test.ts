import { describe, expect, it } from "vitest";
import { CINEMAS } from "../shared/cinemas";

describe("cinema station access seed data", () => {
  it("keeps nearest-station access data for every cinema", () => {
    expect(CINEMAS).not.toHaveLength(0);

    for (const cinema of CINEMAS) {
      expect(cinema.nearestStationId, cinema.id).toBeTruthy();
      expect(cinema.stationWalkMinutes, cinema.id).toBeGreaterThan(0);
      expect(cinema.stationWalkDistanceMeters, cinema.id).toBeGreaterThan(0);
    }
  });
});
