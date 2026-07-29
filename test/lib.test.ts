import { describe, expect, it, vi } from "vitest";
import type { RouteEstimate, Showing } from "../shared/types";
import {
  COLOR_THEME_STORAGE_KEY,
  MOVIE_HIDE_CONFIRMATION,
  appHashStateFromHash,
  appViewFromHash,
  buildMovieExternalLinks,
  filterShowings,
  findCurrentTimeMarkerIndex,
  formatReachableLabel,
  buildGoogleMapsDirectionsUrl,
  colorThemeToggleLabel,
  getAppPageScrollTarget,
  getDateSwipeDirection,
  getScheduleMoviePresentation,
  getShowingReachability,
  groupByMovie,
  groupByScheduleTime,
  groupScheduleTimeBuckets,
  isShowingPast,
  isShowingReachable,
  isShowingUnreachable,
  hashForAppView,
  listMovieShowingDates,
  normalizeMovieTitle,
  parseColorTheme,
  resolveColorTheme,
  scrollPageToTop,
  scheduleProgramClassName,
  scheduleTimeSlot,
  scrollToInitialTimeMarker,
  shouldDefaultExpandScheduleBucket,
  shouldExpandScheduleBucket,
} from "../src/lib";

describe("page navigation scroll targets", () => {
  it("opens today's schedule at the current time", () => {
    expect(
      getAppPageScrollTarget(
        "schedule",
        "2026-07-29",
        "2026-07-29",
        null,
      ),
    ).toBe("current-time");
  });

  it("opens every other page at the top", () => {
    expect(
      getAppPageScrollTarget(
        "schedule",
        "2026-07-30",
        "2026-07-29",
        null,
      ),
    ).toBe("top");

    for (const view of [
      "movies",
      "cinemas",
      "planner",
      "account",
      "about",
    ] as const) {
      expect(
        getAppPageScrollTarget(
          view,
          "2026-07-29",
          "2026-07-29",
          null,
        ),
      ).toBe("top");
    }
  });

  it("keeps explicit movie deep links targeted", () => {
    expect(
      getAppPageScrollTarget(
        "movies",
        "2026-07-29",
        "2026-07-29",
        "movie-key",
      ),
    ).toBe("linked-movie");
  });

  it("moves to the top without smooth-scroll delay", () => {
    const scrollTo = vi.fn();
    scrollPageToTop({ scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  });
});

describe("color theme", () => {
  it("uses a valid saved theme before the system preference", () => {
    expect(resolveColorTheme("light", true)).toBe("light");
    expect(resolveColorTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference for missing or invalid values", () => {
    expect(resolveColorTheme(null, true)).toBe("dark");
    expect(resolveColorTheme("sepia", false)).toBe("light");
    expect(parseColorTheme(undefined)).toBeNull();
  });

  it("describes the theme the toggle will switch to", () => {
    expect(colorThemeToggleLabel("dark")).toBe("ライトモードに切り替える");
    expect(colorThemeToggleLabel("light")).toBe("ダークモードに切り替える");
    expect(COLOR_THEME_STORAGE_KEY).toBe("hamamubi-color-theme");
  });
});

describe("movie preference confirmation", () => {
  it("states only the schedule consequence", () => {
    expect(MOVIE_HIDE_CONFIRMATION).toBe(
      "上映スケジュールから非表示になりますが、よいですか？",
    );
  });
});

describe("reachable showing labels", () => {
  it("includes the travel time used by the reachability decision", () => {
    expect(formatReachableLabel(25)).toBe("間に合う・移動25分");
  });
});

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
    expect(hashForAppView("about")).toBe("#about");
    expect(
      hashForAppView("movies", {
        date: "2026-07-27",
        movie: "劇場版 テスト",
        query: "TOHO 上大岡",
      }),
    ).toBe(
      "#movies?date=2026-07-27&movie=%E5%8A%87%E5%A0%B4%E7%89%88+%E3%83%86%E3%82%B9%E3%83%88&q=TOHO+%E4%B8%8A%E5%A4%A7%E5%B2%A1",
    );
  });

  it("opens a directly linked view and falls back to the schedule", () => {
    expect(appViewFromHash("#movies")).toBe("movies");
    expect(appViewFromHash("#movies?date=2026-07-27")).toBe("movies");
    expect(appViewFromHash("#CINEMAS")).toBe("cinemas");
    expect(appViewFromHash("#planner")).toBe("planner");
    expect(appViewFromHash("#account")).toBe("account");
    expect(appViewFromHash("#about")).toBe("about");
    expect(appViewFromHash("#profile")).toBe("account");
    expect(appViewFromHash("")).toBe("schedule");
    expect(appViewFromHash("#unknown")).toBe("schedule");
  });

  it("restores a linked date and movie from the hash", () => {
    expect(
      appHashStateFromHash(
        "#schedule?date=2026-07-27&movie=%E5%8A%87%E5%A0%B4%E7%89%88+%E3%83%86%E3%82%B9%E3%83%88&q=%E3%83%8E%E3%83%B4%E3%82%A7%E3%83%81%E3%83%B3%E3%83%88",
      ),
    ).toEqual({
      view: "schedule",
      date: "2026-07-27",
      movie: "劇場版 テスト",
      query: "ノヴェチント",
    });
    expect(
      appHashStateFromHash("#movies?date=July-27&movie=%20"),
    ).toEqual({
      view: "movies",
      date: null,
      movie: null,
      query: "",
    });
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

  it("opens filtered result windows regardless of the collapse default", () => {
    expect(shouldExpandScheduleBucket("スパイダーマン", false)).toBe(true);
    expect(shouldExpandScheduleBucket("  ", false)).toBe(false);
    expect(shouldExpandScheduleBucket("", true)).toBe(true);
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

  it("marks a showing five minutes after estimated arrival", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:30:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("does not mark a showing less than five minutes after estimated arrival", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:29:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(false);
  });

  it("classifies every routed showing without a gap", () => {
    const routeByCinema = new Map([[route.cinemaId, route]]);

    expect(
      getShowingReachability(
        showing({ startsAt: "2026-07-24T09:29:00.000Z" }),
        now,
        routeByCinema,
      ),
    ).toBe("unreachable");
    expect(
      getShowingReachability(
        showing({ startsAt: "2026-07-24T09:30:00.000Z" }),
        now,
        routeByCinema,
      ),
    ).toBe("reachable");
    expect(
      getShowingReachability(
        showing({ startsAt: "2026-07-24T09:55:00.000Z" }),
        now,
        routeByCinema,
      ),
    ).toBe("reachable");
    expect(
      getShowingReachability(
        showing({ startsAt: "2026-07-24T09:56:00.000Z" }),
        now,
        routeByCinema,
      ),
    ).toBe("reachable");
  });

  it("keeps a later showing reachable once the arrival margin is met", () => {
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T09:56:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("does not exclude a closer cinema when a farther cinema is reachable", () => {
    const closerRoute = {
      ...route,
      cinemaId: "closer-cinema",
      durationMinutes: 25,
    };
    const fartherRoute = {
      ...route,
      cinemaId: "farther-cinema",
      durationMinutes: 50,
    };
    const startsAt = "2026-07-24T10:10:00.000Z";
    const routeByCinema = new Map([
      [closerRoute.cinemaId, closerRoute],
      [fartherRoute.cinemaId, fartherRoute],
    ]);

    expect(
      isShowingReachable(
        showing({ cinemaId: closerRoute.cinemaId, startsAt }),
        now,
        routeByCinema,
      ),
    ).toBe(true);
    expect(
      isShowingReachable(
        showing({ cinemaId: fartherRoute.cinemaId, startsAt }),
        now,
        routeByCinema,
      ),
    ).toBe(true);
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

  it("does not cap longer routes at one hour", () => {
    const longerRoute: RouteEstimate = {
      ...route,
      durationMinutes: 50,
    };
    expect(
      isShowingReachable(
        showing({ startsAt: "2026-07-24T10:10:00.000Z" }),
        now,
        new Map([[longerRoute.cinemaId, longerRoute]]),
      ),
    ).toBe(true);
  });

  it("does not mark a showing when no travel time exists", () => {
    expect(isShowingReachable(showing(), now, new Map())).toBe(false);
  });

  it("marks an upcoming showing unreachable when travel takes too long", () => {
    expect(
      isShowingUnreachable(
        showing({ startsAt: "2026-07-24T09:24:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("marks a showing unreachable when there is no arrival margin", () => {
    expect(
      isShowingUnreachable(
        showing({ startsAt: "2026-07-24T09:25:00.000Z" }),
        now,
        new Map([[route.cinemaId, route]]),
      ),
    ).toBe(true);
  });

  it("does not infer unreachable without a saved travel time", () => {
    expect(isShowingUnreachable(showing(), now, new Map())).toBe(false);
  });

  it("keeps a starred movie presentation reachable", () => {
    const presentation = getScheduleMoviePresentation(
      [
        showing({
          startsAt: "2026-07-24T09:45:00.000Z",
        }),
      ],
      now,
      new Map([[route.cinemaId, route]]),
    );

    expect(presentation.isReachable).toBe(true);
    expect(presentation.isUnreachable).toBe(false);
    expect(presentation.showings[0]?.isReachable).toBe(true);
    expect(presentation.showings[0]?.travelMinutes).toBe(25);
    expect(
      scheduleProgramClassName({
        isPast: presentation.isPast,
        isReachable: presentation.isReachable,
        isUnreachable: presentation.isUnreachable,
        isStarred: true,
        isLinked: false,
      }),
    ).toBe("program-block reachable starred");
  });

  it("keeps a starred movie presentation unreachable", () => {
    const presentation = getScheduleMoviePresentation(
      [
        showing({
          startsAt: "2026-07-24T09:29:00.000Z",
        }),
      ],
      now,
      new Map([[route.cinemaId, route]]),
    );

    expect(presentation.isReachable).toBe(false);
    expect(presentation.isUnreachable).toBe(true);
    expect(presentation.showings[0]?.isUnreachable).toBe(true);
    expect(presentation.showings[0]?.travelMinutes).toBe(25);
    expect(
      scheduleProgramClassName({
        isPast: presentation.isPast,
        isReachable: presentation.isReachable,
        isUnreachable: presentation.isUnreachable,
        isStarred: true,
        isLinked: false,
      }),
    ).toBe("program-block unreachable starred");
  });

  it("does not mark a mixed-reachability movie block unreachable", () => {
    const presentation = getScheduleMoviePresentation(
      [
        showing({
          startsAt: "2026-07-24T09:29:00.000Z",
        }),
        showing({
          id: "show-2",
          startsAt: "2026-07-24T09:56:00.000Z",
        }),
      ],
      now,
      new Map([[route.cinemaId, route]]),
    );

    expect(presentation.isReachable).toBe(true);
    expect(presentation.isUnreachable).toBe(false);
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
      showing({
        id: "first",
        title: "作品A",
        releaseDate: "2026-07-18",
        startsAt: "2026-07-24T11:00:00Z",
      }),
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
    expect(groups[0].releaseDate).toBe("2026-07-18");
    expect(groups[1].releaseDate).toBeNull();
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

describe("movie showing dates", () => {
  it("returns unique JST dates in chronological order", () => {
    expect(
      listMovieShowingDates([
        { startsAt: "2026-07-30T15:30:00.000Z" },
        { startsAt: "2026-07-29T15:30:00.000Z" },
        { startsAt: "2026-07-29T21:00:00.000Z" },
      ]),
    ).toEqual(["2026-07-30", "2026-07-31"]);
  });
});
