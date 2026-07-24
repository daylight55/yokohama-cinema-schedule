import { describe, expect, it, vi } from "vitest";
import type { RouteEstimate, Showing } from "../shared/types";
import {
  filterShowings,
  findCurrentTimeMarkerIndex,
  groupByMovie,
  groupByScheduleTime,
  isShowingPast,
  isShowingReachable,
  normalizeMovieTitle,
  scheduleTimeSlot,
  scrollToInitialTimeMarker,
} from "../src/lib";

const showing = (overrides: Partial<Showing> = {}): Showing => ({
  id: "show-1",
  sourceId: "tjoy-yokohama",
  cinemaId: "tjoy-yokohama",
  cinemaName: "T・ジョイ横浜",
  cinemaShortName: "T・ジョイ横浜",
  area: "yokohama",
  movieKey: "movie-1",
  title: "テスト映画",
  imageUrl: null,
  startsAt: "2026-07-24T10:00:00.000Z",
  endsAt: "2026-07-24T12:00:00.000Z",
  screen: "シアター1",
  format: null,
  bookingUrl: "https://example.com",
  purchasable: true,
  fetchedAt: "2026-07-24T00:00:00.000Z",
  ...overrides,
});

describe("schedule filtering", () => {
  const now = new Date("2026-07-24T09:00:00.000Z");
  const route: RouteEstimate = {
    cinemaId: "tjoy-yokohama",
    distanceMeters: 1800,
    durationMinutes: 25,
    mode: "estimate",
    provider: "estimate",
    travelMode: "walking",
  };

  it("keeps a showing reachable after travel and preparation time", () => {
    expect(
      isShowingReachable(
        showing(),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("removes a showing that cannot be reached", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:20:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(false);
  });

  it("only marks reachable showings within the next hour", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T10:01:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(false);
  });

  it("filters by area", () => {
    const result = filterShowings(
      [showing(), showing({ id: "show-2", area: "kannai" })],
      {
        selectedArea: "kannai",
        futureOnly: false,
        now,
      },
    );
    expect(result.map((entry) => entry.id)).toEqual(["show-2"]);
  });

  it("marks a showing past as soon as its start time has passed", () => {
    expect(
      isShowingPast(
        showing({
          startsAt: "2026-07-24T08:59:00.000Z",
          endsAt: "2026-07-24T11:00:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
    expect(
      isShowingPast(
        showing({ startsAt: "2026-07-24T09:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
    expect(
      isShowingPast(
        showing({ startsAt: "2026-07-24T09:01:00.000Z" }),
        now,
      ),
    ).toBe(false);
  });
});

describe("movie grouping", () => {
  it("normalizes common format labels across cinema sources", () => {
    expect(normalizeMovieTitle("【IMAX 字幕】 テスト 映画")).toBe(
      normalizeMovieTitle("テスト映画（2D）"),
    );
  });

  it("groups normalized titles and sorts by earliest showing", () => {
    const groups = groupByMovie([
      showing({ id: "later", title: "作品B", startsAt: "2026-07-24T12:00:00Z" }),
      showing({ id: "first", title: "作品A", startsAt: "2026-07-24T11:00:00Z" }),
      showing({
        id: "same",
        title: "【字幕】作品A",
        startsAt: "2026-07-24T13:00:00Z",
      }),
    ]);
    expect(groups.map((group) => [group.title, group.showings.length])).toEqual([
      ["作品A", 2],
      ["作品B", 1],
    ]);
  });

  it("groups the guide by one-minute JST slots", () => {
    const groups = groupByScheduleTime([
      showing({
        id: "first-cinema",
        startsAt: "2026-07-24T00:10:00Z",
        title: "作品A",
      }),
      showing({
        id: "second-cinema",
        cinemaId: "movil",
        startsAt: "2026-07-24T00:10:00Z",
        title: "【字幕】作品A",
      }),
      showing({
        id: "one-minute-later",
        startsAt: "2026-07-24T00:11:00Z",
        title: "作品A",
      }),
      showing({
        id: "next-slot",
        startsAt: "2026-07-24T00:45:00Z",
        title: "作品A",
      }),
      showing({
        id: "later",
        startsAt: "2026-07-24T01:00:00Z",
        title: "作品B",
      }),
    ]);

    expect(groups.map((group) => [group.label, group.showingCount])).toEqual([
      ["09:10", 2],
      ["09:11", 1],
      ["09:45", 1],
      ["10:00", 1],
    ]);
    expect(groups[0].movies).toHaveLength(1);
    expect(groups[0].movies[0].showings).toHaveLength(2);
  });

  it("places the current-time marker at the current minute", () => {
    const groups = groupByScheduleTime([
      showing({ id: "first", startsAt: "2026-07-24T00:20:00Z" }),
      showing({ id: "second", startsAt: "2026-07-24T00:40:00Z" }),
    ]);
    const now = new Date("2026-07-24T00:37:00Z");

    expect(scheduleTimeSlot(now)).toBe("09:37");
    expect(findCurrentTimeMarkerIndex(groups, now)).toBe(1);
    expect(
      findCurrentTimeMarkerIndex(
        groups,
        new Date("2026-07-24T01:00:00Z"),
      ),
    ).toBe(-1);
  });

  it("positions the initial current-time marker without animation", () => {
    const scrollIntoView = vi.fn();

    scrollToInitialTimeMarker({ scrollIntoView });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "instant",
      block: "start",
    });
  });
});
