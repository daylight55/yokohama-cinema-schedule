import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoogleRouteMatrix,
  parseGoogleDuration,
} from "../functions/api/routes";
import type { Cinema } from "../shared/types";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Routes matrix", () => {
  it("requests walking routes and normalizes the response", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-goog-api-key")).toBe("test-key");
        expect(headers.get("x-goog-fieldmask")).toContain("duration");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          travelMode: "WALK",
          origins: [
            {
              waypoint: {
                location: {
                  latLng: { latitude: 35.46, longitude: 139.61 },
                },
              },
            },
          ],
        });
        return Response.json([
          {
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            distanceMeters: 1_250,
            duration: "615s",
          },
        ]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGoogleRouteMatrix("test-key", 35.46, 139.61, [cinema]),
    ).resolves.toEqual([
      {
        cinemaId: "test-cinema",
        distanceMeters: 1_250,
        durationMinutes: 11,
        mode: "route",
        provider: "google_maps",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      expect.any(Object),
    );
  });

  it("parses protobuf duration seconds", () => {
    expect(parseGoogleDuration("615.5s")).toBe(615.5);
  });

  it("rejects invalid duration values", () => {
    expect(parseGoogleDuration("10m")).toBeNull();
  });
});
