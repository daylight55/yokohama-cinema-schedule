import { describe, expect, it, vi } from "vitest";
import type { RouteEstimate, Showing } from "../shared/types";
import {
  appViewFromHash,
  buildMovieExternalLinks,
  filterShowings,
  findCurrentTimeMarkerIndex,
  buildGoogleMapsDirectionsUrl,
  getDateSwipeDirection,
  groupByMovie,
  groupByScheduleTime,
  groupScheduleTimeBuckets,
  isShowingPast,
  isShowingReachable,
  hashForAppView,
  normalizeMovieTitle,
  scheduleTimeSlot,
  scrollToInitialTimeMarker,
  shouldDefaultExpandScheduleBucket,
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

describe("app view hash navigation", () => {
  it("maps every view to a stable hash URL", () => {
    expect(hashForAppView("schedule")).toBe("#schedule");
    expect(hashForAppView("movies")).toBe("#movies");
    expect(hashForAppView("cinemas")).toBe("#cinemas");
    expect(hashForAppView("planner")).toBe("#planner");
    expect(hashForAppView("account")).toBe("#account");
  });

  it("opens a directly linked view and falls back to the schedule", () => {
    expect(appViewFromHash("#movies")).toBe("movies");
    expect(appViewFromHash("#CINEMAS")).toBe("cinemas");
    expect(appViewFromHash("#planner")).toBe("planner");
    expect(appViewFromHash("#account")).toBe("account");
    expect(appViewFromHash("#profile")).toBe("account");
    expect(appViewFromHash("")).toBe("schedule");
    expect(appViewFromHash("#unknown")).toBe("schedule");
  });
});

describe("schedule collapse windows", () => {
  it("groups minute rows into one-hour windows", () => {
    const groups = groupByScheduleTime([
      showing({ id: "a", startsAt: "2026-07-24T00:05:00Z", title: "作品A" }),
      showing({ id: "b", startsAt: "2026-07-24T00:40:00Z", title: "作品B" }),
      showing({ id: "c", startsAt: "2026-07-24T01:10:00Z", title: "作品A" }),
    ]);

    const buckets = groupScheduleTimeBuckets(groups, 60);

    expect(
      buckets.map((bucket) => [
        bucket.label,
        bucket.movieCount,
        bucket.showingCount,
      ]),
    ).toEqual([
      ["09:00〜", 2, 2],
      ["10:00〜", 1, 1],
    ]);
  });

  it("groups minute rows into thirty-minute windows", () => {
    const groups = groupByScheduleTime([
      showing({ id: "a", startsAt: "2026-07-24T00:05:00Z" }),
      showing({ id: "b", startsAt: "2026-07-24T00:40:00Z" }),
      showing({ id: "c", startsAt: "2026-07-24T01:10:00Z" }),
    ]);

    expect(
      groupScheduleTimeBuckets(groups, 30).map((bucket) => bucket.label),
    ).toEqual(["09:00〜", "09:30〜", "10:00〜"]);
  });

  it("opens the current window through the following hour", () => {
    const groups = groupByScheduleTime([
      showing({ id: "a", startsAt: "2026-07-24T00:40:00Z" }),
      showing({ id: "b", startsAt: "2026-07-24T01:10:00Z" }),
      showing({ id: "c", startsAt: "2026-07-24T01:40:00Z" }),
      showing({ id: "d", startsAt: "2026-07-24T02:10:00Z" }),
    ]);
    const now = new Date("2026-07-24T00:37:00Z");
    const buckets = groupScheduleTimeBuckets(groups, 30);

    expect(
      buckets.map((bucket) =>
        shouldDefaultExpandScheduleBucket(
          bucket,
          now,
          "2026-07-24",
          "2026-07-24",
        ),
      ),
    ).toEqual([true, true, true, false]);
    expect(
      shouldDefaultExpandScheduleBucket(
        buckets[0],
        now,
        "2026-07-25",
        "2026-07-24",
      ),
    ).toBe(false);

    const hourlyBuckets = groupScheduleTimeBuckets(groups, 60);
    expect(
      hourlyBuckets.map((bucket) =>
        shouldDefaultExpandScheduleBucket(
          bucket,
          now,
          "2026-07-24",
          "2026-07-24",
        ),
      ),
    ).toEqual([true, true, false]);
  });
});

describe("date swipe gestures", () => {
  it("moves to the next date on a clear left swipe", () => {
    expect(getDateSwipeDirection(-80, 12)).toBe("next");
  });

  it("moves to the previous date on a clear right swipe", () => {
    expect(getDateSwipeDirection(80, -12)).toBe("previous");
  });

  it("ignores short, vertical, and diagonal gestures", () => {
    expect(getDateSwipeDirection(-40, 0)).toBeNull();
    expect(getDateSwipeDirection(20, 90)).toBeNull();
    expect(getDateSwipeDirection(80, 70)).toBeNull();
  });
});

describe("movie external links", () => {
  it("builds encoded title searches for 映画.com and Filmarks", () => {
    const links = buildMovieExternalLinks("テスト 映画");

    expect(links.eiga).toBe(
      "https://eiga.com/search/?t=%E3%83%86%E3%82%B9%E3%83%88+%E6%98%A0%E7%94%BB",
    );
    expect(links.filmarks).toBe(
      "https://filmarks.com/search/movies?q=%E3%83%86%E3%82%B9%E3%83%88+%E6%98%A0%E7%94%BB",
    );
  });
});

describe("schedule filtering", () => {
  const now = new Date("2026-07-24T09:00:00.000Z");
  const route: RouteEstimate = {
    cinemaId: "tjoy-yokohama",
    distanceMeters: 1800,
    durationMinutes: 25,
    accessMinutes: 0,
    bufferMinutes: 0,
    mode: "estimate",
    provider: "estimate",
    travelMode: "walking",
  };

  it("marks a showing around travel time plus twenty minutes", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:45:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("does not mark a showing less than ten minutes after arrival", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:34:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(false);
  });

  it("does not mark a showing more than thirty minutes after arrival", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:56:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(false);
  });

  it("uses the displayed transit time including its route buffer", () => {
    const transitRoute: RouteEstimate = {
      ...route,
      durationMinutes: 25,
      bufferMinutes: 10,
      travelMode: "transit",
    };
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:35:00.000Z" }),
        now,
        new Map([[transitRoute.cinemaId, transitRoute]]),
      ),
    ).toBe(true);
  });

  it("does not mark a showing when no travel time exists", () => {
    expect(isShowingReachable(showing(), now, new Map())).toBe(false);
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

describe("Google Maps directions links", () => {
  it("builds an encoded transit route from the current location", () => {
    const url = new URL(
      buildGoogleMapsDirectionsUrl(
        { latitude: 35.4658, longitude: 139.6223 },
        {
          name: "横浜ブルク13",
          address: "横浜市中区桜木町1-1-7 コレットマーレ6F",
        },
        "transit",
      ),
    );

    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("35.4658,139.6223");
    expect(url.searchParams.get("destination")).toBe(
      "横浜ブルク13 横浜市中区桜木町1-1-7 コレットマーレ6F",
    );
    expect(url.searchParams.get("travelmode")).toBe("transit");
  });

  it("uses Google Maps transit mode for bus routes", () => {
    const url = new URL(
      buildGoogleMapsDirectionsUrl(
        { latitude: 35.4658, longitude: 139.6223 },
        {
          name: "横浜ブルク13",
          address: "横浜市中区桜木町1-1-7 コレットマーレ6F",
        },
        "bus",
      ),
    );

    expect(url.searchParams.get("travelmode")).toBe("transit");
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
