import { describe, expect, it } from "vitest";
import {
  findFreeCalendarPeriods,
  optimizeMovieMarathon,
} from "../shared/planner";
import { buildCinemaTransferMinutes } from "../functions/_lib/cinema-transfers";
import type { Cinema, Showing, StationConnection } from "../shared/types";

const baseShowing = (
  id: string,
  movieKey: string,
  cinemaId: string,
  startsAt: string,
  endsAt: string,
): Showing => ({
  id,
  sourceId: "test",
  cinemaId,
  cinemaName: cinemaId === "a" ? "映画館A" : "映画館B",
  cinemaShortName: cinemaId.toUpperCase(),
  area: "kannai",
  movieKey,
  title: `作品${movieKey}`,
  imageUrl: null,
  startsAt,
  endsAt,
  screen: null,
  format: null,
  bookingUrl: `https://example.com/${id}`,
  purchasable: true,
  fetchedAt: "2026-07-27T00:00:00.000Z",
});

describe("movie marathon optimizer", () => {
  it("prioritizes starred movies while keeping cinema transfers feasible", () => {
    const proposal = optimizeMovieMarathon({
      planDate: "2026-07-28",
      availableStart: "2026-07-28T01:00:00.000Z",
      availableEnd: "2026-07-28T14:00:00.000Z",
      showings: [
        baseShowing(
          "plain",
          "plain",
          "a",
          "2026-07-28T02:00:00.000Z",
          "2026-07-28T04:00:00.000Z",
        ),
        baseShowing(
          "star",
          "star",
          "b",
          "2026-07-28T02:15:00.000Z",
          "2026-07-28T04:15:00.000Z",
        ),
        baseShowing(
          "later",
          "later",
          "a",
          "2026-07-28T05:00:00.000Z",
          "2026-07-28T07:00:00.000Z",
        ),
      ],
      starredMovieKeys: new Set(["star"]),
      homeTravelMinutesByCinema: new Map([
        ["a", 20],
        ["b", 30],
      ]),
      transferMinutesByPair: new Map([
        ["a:b", 35],
        ["b:a", 35],
      ]),
    });

    expect(proposal.items.map((item) => item.showingId)).toEqual([
      "star",
      "later",
    ]);
    expect(proposal.starredCount).toBe(1);
    expect(proposal.items[1].transferMinutes).toBe(35);
  });

  it("never repeats the same movie", () => {
    const proposal = optimizeMovieMarathon({
      planDate: "2026-07-28",
      availableStart: "2026-07-28T01:00:00.000Z",
      availableEnd: "2026-07-28T14:00:00.000Z",
      showings: [
        baseShowing(
          "first",
          "same",
          "a",
          "2026-07-28T02:00:00.000Z",
          "2026-07-28T04:00:00.000Z",
        ),
        baseShowing(
          "second",
          "same",
          "a",
          "2026-07-28T05:00:00.000Z",
          "2026-07-28T07:00:00.000Z",
        ),
      ],
      starredMovieKeys: new Set(),
      homeTravelMinutesByCinema: new Map([["a", 10]]),
      transferMinutesByPair: new Map(),
    });

    expect(proposal.movieCount).toBe(1);
  });
});

describe("calendar availability", () => {
  it("merges busy periods and returns usable free blocks", () => {
    expect(
      findFreeCalendarPeriods(
        "2026-07-28T00:00:00.000Z",
        "2026-07-28T08:00:00.000Z",
        [
          {
            start: "2026-07-28T01:00:00.000Z",
            end: "2026-07-28T02:00:00.000Z",
          },
          {
            start: "2026-07-28T01:30:00.000Z",
            end: "2026-07-28T03:00:00.000Z",
          },
        ],
      ),
    ).toEqual([
      {
        start: "2026-07-28T03:00:00.000Z",
        end: "2026-07-28T08:00:00.000Z",
      },
    ]);
  });
});

describe("cinema transfer estimates", () => {
  const cinemas: Cinema[] = [
    {
      id: "a",
      name: "A",
      shortName: "A",
      area: "yokohama",
      areaLabel: "横浜",
      address: "A",
      latitude: 35.466,
      longitude: 139.622,
      sourceUrl: "https://example.com/a",
      activeUntil: null,
      approval: "private_only",
      nearestStationId: "yokohama",
      stationWalkMinutes: 5,
    },
    {
      id: "b",
      name: "B",
      shortName: "B",
      area: "minatomirai",
      areaLabel: "みなとみらい",
      address: "B",
      latitude: 35.457,
      longitude: 139.633,
      sourceUrl: "https://example.com/b",
      activeUntil: null,
      approval: "private_only",
      nearestStationId: "minatomirai",
      stationWalkMinutes: 4,
    },
  ];
  const connections: StationConnection[] = [
    {
      stationAId: "yokohama",
      stationBId: "minatomirai",
      lineName: "みなとみらい線",
      transportMode: "train",
      rideMinutes: 3,
      headwayMinutes: 4,
      transferMinutes: 5,
    },
  ];

  it("includes station walks, expected train wait, and transfer buffer", () => {
    const transfers = buildCinemaTransferMinutes(cinemas, connections);
    expect(transfers.get("a:b")).toBe(19);
    expect(transfers.get("a:a")).toBe(10);
  });
});
