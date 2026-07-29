import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  ClockIcon,
  CrosshairIcon,
  FilmSlateIcon,
  HouseLineIcon,
  InfoIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MoonIcon,
  PathIcon,
  SignOutIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  UserCircleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  Fragment,
  type FormEvent,
  type MouseEvent,
  type TouchEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addDays, todayInJst } from "../shared/date";
import {
  matchesShowingSearchQuery,
  normalizeSearchQuery,
} from "../shared/search";
import type {
  Cinema,
  CinemaArea,
  CinemaTravelPreference,
  MoviePreferenceStatus,
  RouteEstimate,
  RoutesResponse,
  ScheduleCollapseMinutes,
  ScheduleResponse,
  Showing,
  TravelMode,
  UserProfile,
  ViewingPlan,
  ViewingPlansResponse,
} from "../shared/types";
import {
  AREA_OPTIONS,
  COLOR_THEME_STORAGE_KEY,
  MOVIE_HIDE_CONFIRMATION,
  appHashStateFromHash,
  buildMovieExternalLinks,
  buildDates,
  colorThemeToggleLabel,
  filterShowings,
  findCurrentTimeMarkerIndex,
  formatReachableLabel,
  groupByScheduleTime,
  groupScheduleTimeBuckets,
  groupByMovie,
  getDateSwipeDirection,
  getAppPageScrollTarget,
  getScheduleMoviePresentation,
  hashForAppView,
  listMovieShowingDates,
  normalizeMovieTitle,
  parseColorTheme,
  resolveColorTheme,
  scrollPageToTop,
  scrollToInitialTimeMarker,
  scheduleProgramClassName,
  shouldDefaultExpandScheduleBucket,
  shouldExpandScheduleBucket,
  type AppView,
  type ColorTheme,
} from "./lib";
import { PlannerPage } from "./PlannerPage";
import { AccountPage } from "./AccountPage";
import { AboutPage } from "./AboutPage";
import { PageHeader, PageShell } from "./PageLayout";
import { ViewingPlansPage } from "./ViewingPlansPage";

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const fullDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const closureDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const updatedFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const TRAVEL_MODE_OPTIONS: Array<{ value: TravelMode; label: string }> = [
  { value: "walking", label: "徒歩" },
  { value: "transit", label: "電車" },
  { value: "bus", label: "バス" },
  { value: "bicycle", label: "自転車" },
];

interface MoviePreferenceTarget {
  preferenceKey: string;
  title: string;
  imageUrl: string | null;
  anchorElement?: HTMLElement | null;
}

function getStoredColorTheme(): ColorTheme | null {
  try {
    return parseColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeColorTheme(theme: ColorTheme): void {
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // The active tab still switches themes when storage is unavailable.
  }
}

export function App() {
  const [now, setNow] = useState(() => new Date());
  const [theme, setTheme] = useState<ColorTheme>(() => {
    const bootstrappedTheme = parseColorTheme(
      document.documentElement.dataset.theme,
    );
    return (
      bootstrappedTheme ??
      resolveColorTheme(
        getStoredColorTheme(),
        window.matchMedia("(prefers-color-scheme: dark)").matches,
      )
    );
  });
  const [hasExplicitTheme, setHasExplicitTheme] = useState(
    () => getStoredColorTheme() !== null,
  );
  const currentTimeMarkerRef = useRef<HTMLDivElement>(null);
  const dateSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const navigationDialogRef = useRef<HTMLDialogElement>(null);
  const moviePreferenceDialogRef = useRef<HTMLDialogElement>(null);
  const pendingMovieAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const pendingMovieScrollRef = useRef<{
    left: number;
    top: number;
  } | null>(null);
  const pendingCinemaAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const lastMovieDeepLinkRef = useRef<string | null>(null);
  const didInitialTimeScrollRef = useRef(false);
  const pendingHomeScrollRef = useRef(false);
  const lastPageScrollKeyRef = useRef<string | null>(null);
  const today = todayInJst(now);
  const dates = useMemo(() => buildDates(now), [today]);
  const plannerMaxDate = addDays(today, 365);
  const [initialHashState] = useState(() =>
    appHashStateFromHash(window.location.hash),
  );
  const initialScheduleDate =
    initialHashState.date && dates.includes(initialHashState.date)
      ? initialHashState.date
      : dates[0];
  const initialPlannerDate =
    initialHashState.date &&
    initialHashState.date >= today &&
    initialHashState.date <= plannerMaxDate
      ? initialHashState.date
      : today;
  const [selectedDate, setSelectedDate] = useState(initialScheduleDate);
  const [showAllMovieDates, setShowAllMovieDates] = useState(
    initialHashState.view === "movies" && initialHashState.date === null,
  );
  const [searchDraft, setSearchDraft] = useState(initialHashState.query);
  const normalizedSearchQuery = normalizeSearchQuery(searchDraft);
  const interactiveSearchQuery = useDeferredValue(normalizedSearchQuery);
  const [plannerDate, setPlannerDate] = useState(initialPlannerDate);
  const [selectedMovieKey, setSelectedMovieKey] = useState<string | null>(
    initialHashState.view === "schedule" ||
      initialHashState.view === "movies"
      ? initialHashState.movie
      : null,
  );
  const [selectedArea, setSelectedArea] = useState<CinemaArea | "all">("all");
  const [futureOnly, setFutureOnly] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [routes, setRoutes] = useState<RouteEstimate[]>([]);
  const [view, setView] = useState<AppView>(initialHashState.view);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [showJumpToNow, setShowJumpToNow] = useState(false);
  const [cinemaTravelModes, setCinemaTravelModes] = useState<
    Map<string, TravelMode>
  >(() => new Map());
  const [cinemaCustomDurations, setCinemaCustomDurations] = useState<
    Map<string, number | null>
  >(() => new Map());
  const [cinemaDurationDrafts, setCinemaDurationDrafts] = useState<
    Map<string, string>
  >(() => new Map());
  const [cinemaNotes, setCinemaNotes] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [cinemaNoteDrafts, setCinemaNoteDrafts] = useState<
    Map<string, string>
  >(() => new Map());
  const [savingCinemaIds, setSavingCinemaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [cinemaPreferenceError, setCinemaPreferenceError] = useState<
    string | null
  >(null);
  const [starredMovieKeys, setStarredMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [movieStatusByKey, setMovieStatusByKey] = useState<
    Map<string, MoviePreferenceStatus>
  >(() => new Map());
  const [savingMovieKeys, setSavingMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [activeMoviePreference, setActiveMoviePreference] =
    useState<MoviePreferenceTarget | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    departureRegistered: false,
    departureUpdatedAt: null,
    scheduleCollapseMinutes: 60,
  });
  const [profileState, setProfileState] = useState<
    "idle" | "saving" | "deleting"
  >("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [collapsePreferenceState, setCollapsePreferenceState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [viewingPlans, setViewingPlans] = useState<ViewingPlan[]>([]);
  const [viewingPlansState, setViewingPlansState] = useState<
    "loading" | "idle" | "error"
  >("loading");
  const [viewingPlanError, setViewingPlanError] = useState<string | null>(null);
  const [savingViewingPlanIds, setSavingViewingPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const selectedMovieListDate =
    view === "movies" && showAllMovieDates ? null : selectedDate;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute("content", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0d1211" : "#fff8ee");
  }, [theme]);

  useEffect(() => {
    if (hasExplicitTheme) return;

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemTheme = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? "dark" : "light");
    };
    colorSchemeQuery.addEventListener("change", followSystemTheme);
    return () => {
      colorSchemeQuery.removeEventListener("change", followSystemTheme);
    };
  }, [hasExplicitTheme]);

  useLayoutEffect(() => {
    const pendingAnchor = pendingMovieAnchorRef.current;
    if (!pendingAnchor) return;
    if (!pendingAnchor.element.isConnected) {
      pendingMovieAnchorRef.current = null;
      return;
    }
    const nextTop = pendingAnchor.element.getBoundingClientRect().top;
    window.scrollBy(0, nextTop - pendingAnchor.top);
    pendingMovieAnchorRef.current = null;
  }, [movieStatusByKey]);

  useLayoutEffect(() => {
    const pendingScroll = pendingMovieScrollRef.current;
    if (!pendingScroll) return;
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(pendingScroll.left, pendingScroll.top);
    root.style.scrollBehavior = previousScrollBehavior;
    pendingMovieScrollRef.current = null;
  }, [movieStatusByKey, starredMovieKeys]);

  useLayoutEffect(() => {
    const pageScrollKey =
      view === "schedule" || view === "movies"
        ? `${view}:${selectedMovieListDate ?? "all"}:${selectedMovieKey ?? ""}`
        : view === "planner"
          ? `${view}:${plannerDate}`
          : view;
    if (lastPageScrollKeyRef.current === pageScrollKey) return;
    lastPageScrollKeyRef.current = pageScrollKey;

    const scrollTarget = getAppPageScrollTarget(
      view,
      selectedDate,
      today,
      selectedMovieKey,
    );

    pendingHomeScrollRef.current = false;
    didInitialTimeScrollRef.current = false;

    if (scrollTarget === "linked-movie") {
      lastMovieDeepLinkRef.current = null;
      return;
    }
    if (scrollTarget === "top") {
      scrollPageToTop(window);
      let finalScrollFrame: number | null = null;
      const settleScrollFrame = window.requestAnimationFrame(() => {
        scrollPageToTop(window);
        finalScrollFrame = window.requestAnimationFrame(() => {
          scrollPageToTop(window);
        });
      });
      return () => {
        window.cancelAnimationFrame(settleScrollFrame);
        if (finalScrollFrame !== null) {
          window.cancelAnimationFrame(finalScrollFrame);
        }
      };
    }
    // The current-time layout effect handles today's schedule after data renders.
    return undefined;
  }, [
    plannerDate,
    selectedDate,
    selectedMovieKey,
    selectedMovieListDate,
    today,
    view,
  ]);

  useLayoutEffect(() => {
    const pendingAnchor = pendingCinemaAnchorRef.current;
    if (!pendingAnchor || !pendingAnchor.element.isConnected) return;
    const nextTop = pendingAnchor.element.getBoundingClientRect().top;
    window.scrollBy(0, nextTop - pendingAnchor.top);
    pendingCinemaAnchorRef.current = null;
  }, [routes]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const interval = window.setInterval(updateClock, 30_000);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateClock);
    };
  }, []);

  useEffect(() => {
    const dialog = moviePreferenceDialogRef.current;
    if (activeMoviePreference && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [activeMoviePreference]);

  useEffect(() => {
    const syncViewFromHash = () => {
      const hashState = appHashStateFromHash(window.location.hash);
      const nextView = hashState.view;
      const usesWeeklyDate =
        nextView === "schedule" || nextView === "movies";
      const nextShowAllMovieDates =
        nextView === "movies" && hashState.date === null;
      const nextScheduleDate =
        hashState.date && dates.includes(hashState.date)
          ? hashState.date
          : dates[0];
      const nextPlannerDate =
        hashState.date &&
        hashState.date >= today &&
        hashState.date <= plannerMaxDate
          ? hashState.date
          : today;
      const nextMovieKey = usesWeeklyDate ? hashState.movie : null;
      const canonicalHash = hashForAppView(nextView, {
        date:
          nextView === "movies" && nextShowAllMovieDates
            ? null
            : usesWeeklyDate
              ? nextScheduleDate
              : nextView === "planner"
                ? nextPlannerDate
                : null,
        movie: nextMovieKey,
        query: usesWeeklyDate ? hashState.query : null,
      });
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(null, "", canonicalHash);
      }
      setView(nextView);
      setSelectedDate(nextScheduleDate);
      setShowAllMovieDates(nextShowAllMovieDates);
      setSearchDraft(usesWeeklyDate ? hashState.query : "");
      setPlannerDate(nextPlannerDate);
      setSelectedMovieKey(nextMovieKey);
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
    };
  }, [dates, plannerMaxDate, today]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ date: selectedDate });
    if (view === "movies" && showAllMovieDates) {
      params.set("through", dates[dates.length - 1]);
    }
    fetch(`/api/showings?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/auth/login");
          throw new Error("ログインが必要です");
        }
        if (!response.ok) throw new Error("スケジュールを取得できませんでした");
        return response.json() as Promise<ScheduleResponse>;
      })
      .then((data) => {
        setSchedule(data);
        setStarredMovieKeys(
          new Set(
            data.preferences
              .filter((preference) => preference.starred)
              .map((preference) => preference.movieKey),
          ),
        );
        setMovieStatusByKey(
          new Map(
            data.preferences
              .filter(
                (
                  preference,
                ): preference is typeof preference & {
                  status: MoviePreferenceStatus;
                } => preference.status !== null,
              )
              .map((preference) => [
                preference.movieKey,
                preference.status,
              ]),
          ),
        );
        setCinemaTravelModes(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.travelMode,
            ]),
          ),
        );
        setCinemaCustomDurations(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.customDurationMinutes,
            ]),
          ),
        );
        setCinemaDurationDrafts(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.customDurationMinutes?.toString() ?? "",
            ]),
          ),
        );
        setCinemaNotes(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.note,
            ]),
          ),
        );
        setCinemaNoteDrafts(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.note,
            ]),
          ),
        );
        setUserProfile(data.userProfile);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") {
          setError(
            reason instanceof Error
              ? reason.message
              : "スケジュールを取得できませんでした",
          );
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [dates, selectedDate, showAllMovieDates, view]);

  useEffect(() => {
    const controller = new AbortController();
    setViewingPlansState("loading");
    setViewingPlanError(null);
    fetch("/api/viewing-plans", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/auth/login");
          throw new Error("ログインが必要です");
        }
        if (!response.ok) {
          throw new Error("鑑賞予定を取得できませんでした");
        }
        return response.json() as Promise<ViewingPlansResponse>;
      })
      .then((data) => {
        setViewingPlans(data.plans);
        setViewingPlansState("idle");
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name === "AbortError") return;
        setViewingPlanError(
          reason instanceof Error
            ? reason.message
            : "鑑賞予定を取得できませんでした",
        );
        setViewingPlansState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedDate !== dates[0]) setFutureOnly(false);
  }, [dates, selectedDate]);

  const routeByCinema = useMemo(
    () => new Map(routes.map((route) => [route.cinemaId, route])),
    [routes],
  );
  const cinemaList = useMemo(
    () =>
      (schedule?.cinemas ?? [])
        .filter(
          (cinema) =>
            selectedArea === "all" || cinema.area === selectedArea,
        )
        .sort(
          (cinemaA, cinemaB) =>
            (routeByCinema.get(cinemaA.id)?.durationMinutes ??
              Number.POSITIVE_INFINITY) -
              (routeByCinema.get(cinemaB.id)?.durationMinutes ??
                Number.POSITIVE_INFINITY) ||
            cinemaA.name.localeCompare(cinemaB.name, "ja"),
        ),
    [routeByCinema, schedule?.cinemas, selectedArea],
  );
  const visibleShowings = useMemo(
    () =>
      filterShowings(schedule?.showings ?? [], {
        selectedArea,
        futureOnly: futureOnly && selectedDate === dates[0],
        now,
      }).filter(
        (showing) =>
          !movieStatusByKey.has(normalizeMovieTitle(showing.title)) &&
          matchesShowingSearchQuery(
            interactiveSearchQuery,
            showing.title,
            showing.cinemaName,
            showing.cinemaShortName,
          ),
      ),
    [
      dates,
      futureOnly,
      interactiveSearchQuery,
      now,
      movieStatusByKey,
      schedule?.showings,
      selectedArea,
      selectedDate,
    ],
  );
  const timeGroups = useMemo(
    () => groupByScheduleTime(visibleShowings),
    [visibleShowings],
  );
  const scheduleTimeBuckets = useMemo(
    () =>
      userProfile.scheduleCollapseMinutes === 0
        ? []
        : groupScheduleTimeBuckets(
            timeGroups,
            userProfile.scheduleCollapseMinutes,
          ),
    [timeGroups, userProfile.scheduleCollapseMinutes],
  );
  const movieList = useMemo(() => {
    const areaShowings = (schedule?.showings ?? []).filter(
      (showing) =>
        (selectedArea === "all" || showing.area === selectedArea) &&
        matchesShowingSearchQuery(
          interactiveSearchQuery,
          showing.title,
          showing.cinemaName,
          showing.cinemaShortName,
        ),
    );
    return groupByMovie(areaShowings).sort((movieA, movieB) => {
      const starredDifference =
        Number(starredMovieKeys.has(movieB.preferenceKey)) -
        Number(starredMovieKeys.has(movieA.preferenceKey));
      return (
        starredDifference ||
        movieA.title.localeCompare(movieB.title, "ja")
      );
    });
  }, [
    interactiveSearchQuery,
    schedule?.showings,
    selectedArea,
    starredMovieKeys,
  ]);
  const movieCount = useMemo(
    () =>
      new Set(
        timeGroups.flatMap((group) =>
          group.movies.map((movie) => movie.key),
        ),
      ).size,
    [timeGroups],
  );
  const currentTimeMarkerIndex =
    selectedDate === today
      ? findCurrentTimeMarkerIndex(timeGroups, now)
      : -1;
  const showCurrentTimeMarkerAtEnd =
    selectedDate === today &&
    timeGroups.length > 0 &&
    currentTimeMarkerIndex === -1;

  useLayoutEffect(() => {
    if (
      loading ||
      error ||
      schedule?.date !== selectedDate ||
      !selectedMovieKey ||
      (view !== "schedule" && view !== "movies")
    ) {
      return;
    }
    const deepLinkKey = `${view}:${selectedMovieListDate ?? "all"}:${selectedMovieKey}`;
    if (lastMovieDeepLinkRef.current === deepLinkKey) return;
    const target = [
      ...document.querySelectorAll<HTMLElement>("[data-movie-key]"),
    ].find((element) => element.dataset.movieKey === selectedMovieKey);
    if (!target) return;
    const collapsedWindow = target.closest<HTMLDetailsElement>(
      "details.schedule-window",
    );
    if (collapsedWindow) collapsedWindow.open = true;
    target.scrollIntoView({ behavior: "auto", block: "center" });
    lastMovieDeepLinkRef.current = deepLinkKey;
  }, [
    error,
    loading,
    movieList,
    schedule?.date,
    selectedDate,
    selectedMovieListDate,
    selectedMovieKey,
    timeGroups,
    view,
  ]);

  useLayoutEffect(() => {
    if (
      didInitialTimeScrollRef.current ||
      loading ||
      error ||
      schedule?.date !== selectedDate ||
      selectedMovieKey ||
      selectedDate !== today ||
      view !== "schedule" ||
      !currentTimeMarkerRef.current
    ) {
      return;
    }

    scrollToInitialTimeMarker(currentTimeMarkerRef.current);
    didInitialTimeScrollRef.current = true;
  }, [
    error,
    loading,
    schedule?.date,
    selectedDate,
    selectedMovieKey,
    timeGroups,
    today,
    view,
  ]);

  useEffect(() => {
    const marker = currentTimeMarkerRef.current;
    if (
      loading ||
      error ||
      selectedDate !== today ||
      view !== "schedule" ||
      !marker
    ) {
      setShowJumpToNow(false);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setShowJumpToNow(!entry.isIntersecting);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [
    currentTimeMarkerIndex,
    error,
    loading,
    selectedDate,
    showCurrentTimeMarkerAtEnd,
    timeGroups.length,
    today,
    view,
  ]);

  const fetchRoutes = useCallback(async () => {
    setRouteState("loading");
    try {
      const response = await fetch("/api/routes", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as RoutesResponse;
      setRoutes(data.routes);
      setRouteState(data.originRegistered ? "ready" : "idle");
    } catch {
      setRoutes([]);
      setRouteState("error");
    }
  }, []);

  useEffect(() => {
    if (!userProfile.departureRegistered) {
      setRoutes([]);
      setRouteState("idle");
      return;
    }
    void fetchRoutes();
  }, [
    fetchRoutes,
    userProfile.departureRegistered,
    userProfile.departureUpdatedAt,
  ]);

  const registerDepartureLocation = async () => {
    setProfileError(null);
    if (!navigator.geolocation) {
      setProfileError("このブラウザでは位置情報を利用できません");
      return;
    }

    setProfileState("saving");
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10_000,
            maximumAge: 0,
          });
        },
      );
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
      if (!response.ok) throw new Error();
      const profile = (await response.json()) as UserProfile;
      setUserProfile(profile);
      setSchedule((current) =>
        current ? { ...current, userProfile: profile } : current,
      );
    } catch {
      setProfileError(
        "ベース出発地点を登録できませんでした。位置情報の許可を確認してください",
      );
    } finally {
      setProfileState("idle");
    }
  };

  const deleteDepartureProfile = async () => {
    if (!window.confirm("登録したベース出発地点を削除しますか？")) return;

    setProfileState("deleting");
    setProfileError(null);
    try {
      const response = await fetch("/api/profile", { method: "DELETE" });
      if (!response.ok) throw new Error();
      const profile = (await response.json()) as UserProfile;
      setUserProfile(profile);
      setSchedule((current) =>
        current ? { ...current, userProfile: profile } : current,
      );
    } catch {
      setProfileError("ベース出発地点を削除できませんでした");
    } finally {
      setProfileState("idle");
    }
  };

  const saveScheduleCollapsePreference = async (
    scheduleCollapseMinutes: ScheduleCollapseMinutes,
  ) => {
    const previousValue = userProfile.scheduleCollapseMinutes;
    setProfileError(null);
    setCollapsePreferenceState("saving");
    setUserProfile((current) => ({
      ...current,
      scheduleCollapseMinutes,
    }));
    setSchedule((current) =>
      current
        ? {
            ...current,
            userProfile: {
              ...current.userProfile,
              scheduleCollapseMinutes,
            },
          }
        : current,
    );

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ scheduleCollapseMinutes }),
      });
      if (!response.ok) throw new Error();
      const profile = (await response.json()) as UserProfile;
      setUserProfile(profile);
      setSchedule((current) =>
        current ? { ...current, userProfile: profile } : current,
      );
      setCollapsePreferenceState("saved");
      window.setTimeout(() => setCollapsePreferenceState("idle"), 1_500);
    } catch {
      setUserProfile((current) => ({
        ...current,
        scheduleCollapseMinutes: previousValue,
      }));
      setSchedule((current) =>
        current
          ? {
              ...current,
              userProfile: {
                ...current.userProfile,
                scheduleCollapseMinutes: previousValue,
              },
            }
          : current,
      );
      setCollapsePreferenceState("idle");
      setProfileError("折りたたみ設定を保存できませんでした");
    }
  };

  const saveCinemaTravelMode = async (
    cinemaId: string,
    travelMode: TravelMode,
    anchor: HTMLElement | null,
  ) => {
    if (savingCinemaIds.has(cinemaId)) return;
    if (userProfile.departureRegistered) rememberCinemaAnchor(anchor);
    const previousMode = cinemaTravelModes.get(cinemaId) ?? "transit";
    setCinemaPreferenceError(null);
    setCinemaTravelModes((current) => {
      const next = new Map(current);
      next.set(cinemaId, travelMode);
      return next;
    });
    setSavingCinemaIds((current) => new Set(current).add(cinemaId));

    try {
      const response = await fetch("/api/cinema-preferences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          cinemaId,
          travelMode,
          customDurationMinutes:
            cinemaCustomDurations.get(cinemaId) ?? null,
        }),
      });
      if (!response.ok) throw new Error();
      const preference =
        (await response.json()) as CinemaTravelPreference;
      setCinemaTravelModes((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.travelMode);
        return next;
      });
      if (userProfile.departureRegistered) await fetchRoutes();
    } catch {
      pendingCinemaAnchorRef.current = null;
      setCinemaTravelModes((current) => {
        const next = new Map(current);
        next.set(cinemaId, previousMode);
        return next;
      });
      setCinemaPreferenceError("移動方法を保存できませんでした");
    } finally {
      setSavingCinemaIds((current) => {
        const next = new Set(current);
        next.delete(cinemaId);
        return next;
      });
    }
  };

  const saveCinemaCustomDuration = async (
    cinemaId: string,
    customDurationMinutes: number | null,
    anchor: HTMLElement | null,
  ) => {
    if (savingCinemaIds.has(cinemaId)) return;
    if (userProfile.departureRegistered) rememberCinemaAnchor(anchor);
    const travelMode = cinemaTravelModes.get(cinemaId) ?? "transit";
    setCinemaPreferenceError(null);
    setSavingCinemaIds((current) => new Set(current).add(cinemaId));

    try {
      const response = await fetch("/api/cinema-preferences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          cinemaId,
          travelMode,
          customDurationMinutes,
        }),
      });
      if (!response.ok) throw new Error();
      const preference =
        (await response.json()) as CinemaTravelPreference;
      setCinemaCustomDurations((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.customDurationMinutes);
        return next;
      });
      setCinemaDurationDrafts((current) => {
        const next = new Map(current);
        next.set(
          cinemaId,
          preference.customDurationMinutes?.toString() ?? "",
        );
        return next;
      });
      if (userProfile.departureRegistered) await fetchRoutes();
    } catch {
      pendingCinemaAnchorRef.current = null;
      setCinemaPreferenceError("自分の所要時間を保存できませんでした");
    } finally {
      setSavingCinemaIds((current) => {
        const next = new Set(current);
        next.delete(cinemaId);
        return next;
      });
    }
  };

  const saveCinemaNote = async (
    cinemaId: string,
    anchor: HTMLElement | null,
  ) => {
    if (savingCinemaIds.has(cinemaId)) return;
    rememberCinemaAnchor(anchor);
    const note = cinemaNoteDrafts.get(cinemaId)?.trim() ?? "";
    setCinemaPreferenceError(null);
    setSavingCinemaIds((current) => new Set(current).add(cinemaId));

    try {
      const response = await fetch("/api/cinema-preferences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ cinemaId, note }),
      });
      if (!response.ok) throw new Error();
      const preference =
        (await response.json()) as CinemaTravelPreference;
      setCinemaNotes((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.note);
        return next;
      });
      setCinemaNoteDrafts((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.note);
        return next;
      });
    } catch {
      pendingCinemaAnchorRef.current = null;
      setCinemaPreferenceError("映画館メモを保存できませんでした");
    } finally {
      setSavingCinemaIds((current) => {
        const next = new Set(current);
        next.delete(cinemaId);
        return next;
      });
    }
  };

  const saveCinemaDurationDraft = (
    cinemaId: string,
    anchor: HTMLElement | null,
  ) => {
    const value = cinemaDurationDrafts.get(cinemaId)?.trim() ?? "";
    const durationMinutes = Number(value);
    if (
      value === "" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 1440
    ) {
      setCinemaPreferenceError(
        "自分の所要時間は1〜1440分の整数で入力してください",
      );
      return;
    }
    void saveCinemaCustomDuration(cinemaId, durationMinutes, anchor);
  };

  const openNavigation = () => {
    navigationDialogRef.current?.showModal();
    setIsNavigationOpen(true);
  };

  const closeNavigation = () => {
    navigationDialogRef.current?.close();
  };

  const navigateHashLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    window.location.hash = event.currentTarget.hash;
  };

  const submitScheduleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.hash = hashForAppView(view, {
      date: selectedMovieListDate,
      query: searchDraft,
    });
  };

  const clearScheduleSearch = () => {
    setSearchDraft("");
    window.location.hash = hashForAppView(view, {
      date: selectedMovieListDate,
    });
  };

  const toggleViewingPlan = async (
    showing: Showing,
  ): Promise<"added" | "removed" | null> => {
    const isPlanned = viewingPlans.some(
      (plan) => plan.showingId === showing.id,
    );
    setSavingViewingPlanIds((current) => new Set(current).add(showing.id));
    setViewingPlanError(null);

    try {
      const response = await fetch(
        isPlanned
          ? `/api/viewing-plans?id=${encodeURIComponent(showing.id)}`
          : "/api/viewing-plans",
        isPlanned
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
              },
              body: JSON.stringify({ showingId: showing.id }),
            },
      );
      if (!response.ok) throw new Error();

      if (isPlanned) {
        setViewingPlans((current) =>
          current.filter((plan) => plan.showingId !== showing.id),
        );
        return "removed";
      }

      const savedPlan = (await response.json()) as ViewingPlan;
      setViewingPlans((current) =>
        [
          ...current.filter(
            (plan) => plan.showingId !== savedPlan.showingId,
          ),
          savedPlan,
        ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setViewingPlansState("idle");
      return "added";
    } catch {
      setViewingPlanError("鑑賞予定を保存できませんでした");
      return null;
    } finally {
      setSavingViewingPlanIds((current) => {
        const next = new Set(current);
        next.delete(showing.id);
        return next;
      });
    }
  };

  const removeViewingPlan = async (plan: ViewingPlan): Promise<void> => {
    setSavingViewingPlanIds((current) => new Set(current).add(plan.showingId));
    setViewingPlanError(null);
    try {
      const response = await fetch(
        `/api/viewing-plans?id=${encodeURIComponent(plan.showingId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setViewingPlans((current) =>
        current.filter((item) => item.showingId !== plan.showingId),
      );
    } catch {
      setViewingPlanError("鑑賞予定を削除できませんでした");
    } finally {
      setSavingViewingPlanIds((current) => {
        const next = new Set(current);
        next.delete(plan.showingId);
        return next;
      });
    }
  };

  const handleScheduleTouchStart = (event: TouchEvent<HTMLElement>) => {
    dateSwipeStartRef.current = null;
    if (
      (view !== "schedule" && view !== "movies") ||
      loading ||
      event.touches.length !== 1
    ) {
      return;
    }
    const touch = event.touches[0];
    dateSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleScheduleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = dateSwipeStartRef.current;
    dateSwipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const direction = getDateSwipeDirection(
      touch.clientX - start.x,
      touch.clientY - start.y,
    );
    if (!direction) return;
    suppressClickUntilRef.current = Date.now() + 500;
    const swipeDates: Array<string | null> =
      view === "movies" ? [null, ...dates] : dates;
    const currentIndex =
      view === "movies" && showAllMovieDates
        ? 0
        : swipeDates.indexOf(selectedDate);
    const nextIndex =
      direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < swipeDates.length) {
      window.location.hash = hashForAppView(view, {
        date: swipeDates[nextIndex],
        query: normalizedSearchQuery,
      });
    }
  };

  const handleMainClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (Date.now() > suppressClickUntilRef.current) return;
    suppressClickUntilRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  const jumpToCurrentTime = () => {
    const marker = currentTimeMarkerRef.current;
    if (!marker) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    marker.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const goHomeToCurrentTime = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    pendingHomeScrollRef.current = true;
    didInitialTimeScrollRef.current = false;
    setSelectedArea("all");
    setFutureOnly(false);
    setSelectedMovieKey(null);

    const homeHash = hashForAppView("schedule", { date: today });
    if (window.location.hash !== homeHash) {
      window.location.hash = homeHash;
      return;
    }

    const marker = currentTimeMarkerRef.current;
    if (marker) {
      scrollToInitialTimeMarker(marker);
      pendingHomeScrollRef.current = false;
      didInitialTimeScrollRef.current = true;
    }
  };

  const goHomeFromNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    closeNavigation();
    goHomeToCurrentTime(event);
  };

  useLayoutEffect(() => {
    if (
      !pendingHomeScrollRef.current ||
      loading ||
      error ||
      schedule?.date !== selectedDate ||
      view !== "schedule" ||
      selectedDate !== today ||
      !currentTimeMarkerRef.current
    ) {
      return;
    }

    scrollToInitialTimeMarker(currentTimeMarkerRef.current);
    pendingHomeScrollRef.current = false;
    didInitialTimeScrollRef.current = true;
  }, [
    error,
    loading,
    schedule?.date,
    selectedDate,
    timeGroups,
    today,
    view,
  ]);

  const rememberMovieAnchor = (element: HTMLElement | null) => {
    if (!element) return;
    pendingMovieAnchorRef.current = {
      element,
      top: element.getBoundingClientRect().top,
    };
  };

  const rememberMovieScroll = () => {
    pendingMovieScrollRef.current = {
      left: window.scrollX,
      top: window.scrollY,
    };
  };

  const rememberCinemaAnchor = (element: HTMLElement | null) => {
    if (!element) return;
    pendingCinemaAnchorRef.current = {
      element,
      top: element.getBoundingClientRect().top,
    };
  };

  const toggleMovieStar = async (
    movie: MoviePreferenceTarget,
  ) => {
    if (savingMovieKeys.has(movie.preferenceKey)) return;
    rememberMovieScroll();
    const wasStarred = starredMovieKeys.has(movie.preferenceKey);
    const nextStarred = !wasStarred;
    setPreferenceError(null);
    setStarredMovieKeys((current) => {
      const next = new Set(current);
      if (nextStarred) next.add(movie.preferenceKey);
      else next.delete(movie.preferenceKey);
      return next;
    });
    setSavingMovieKeys((current) =>
      new Set(current).add(movie.preferenceKey),
    );

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          title: movie.title,
          imageUrl: movie.imageUrl,
          starred: nextStarred,
        }),
      });
      if (!response.ok) throw new Error();
    } catch {
      rememberMovieScroll();
      setStarredMovieKeys((current) => {
        const next = new Set(current);
        if (wasStarred) next.add(movie.preferenceKey);
        else next.delete(movie.preferenceKey);
        return next;
      });
      setPreferenceError("スターを保存できませんでした");
    } finally {
      setSavingMovieKeys((current) => {
        const next = new Set(current);
        next.delete(movie.preferenceKey);
        return next;
      });
    }
  };

  const updateMovieStatus = async (
    movie: MoviePreferenceTarget,
    requestedStatus: MoviePreferenceStatus,
    anchorElement: HTMLElement | null,
  ) => {
    if (savingMovieKeys.has(movie.preferenceKey)) return undefined;
    const previousStatus = movieStatusByKey.get(movie.preferenceKey) ?? null;
    const nextStatus =
      previousStatus === requestedStatus ? null : requestedStatus;
    if (nextStatus) {
      const confirmed = window.confirm(MOVIE_HIDE_CONFIRMATION);
      if (!confirmed) return undefined;
    }

    if (view === "schedule") rememberMovieScroll();
    else rememberMovieAnchor(anchorElement);
    setPreferenceError(null);
    setMovieStatusByKey((current) => {
      const next = new Map(current);
      if (nextStatus) next.set(movie.preferenceKey, nextStatus);
      else next.delete(movie.preferenceKey);
      return next;
    });
    setSavingMovieKeys((current) =>
      new Set(current).add(movie.preferenceKey),
    );

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          title: movie.title,
          imageUrl: movie.imageUrl,
          status: nextStatus,
        }),
      });
      if (!response.ok) throw new Error();
      return nextStatus;
    } catch {
      if (view === "schedule") rememberMovieScroll();
      else rememberMovieAnchor(anchorElement);
      setMovieStatusByKey((current) => {
        const next = new Map(current);
        if (previousStatus) {
          next.set(movie.preferenceKey, previousStatus);
        } else {
          next.delete(movie.preferenceKey);
        }
        return next;
      });
      setPreferenceError("作品の状態を保存できませんでした");
      return undefined;
    } finally {
      setSavingMovieKeys((current) => {
        const next = new Set(current);
        next.delete(movie.preferenceKey);
        return next;
      });
    }
  };

  const openMoviePreferenceDialog = (
    movie: MoviePreferenceTarget,
    anchorElement: HTMLElement | null,
  ) => {
    setPreferenceError(null);
    setActiveMoviePreference({ ...movie, anchorElement });
  };

  const closeMoviePreferenceDialog = () => {
    moviePreferenceDialogRef.current?.close();
  };

  const selectMovieStatusFromDialog = async (
    status: MoviePreferenceStatus,
  ) => {
    if (!activeMoviePreference) return;
    const savedStatus = await updateMovieStatus(
      activeMoviePreference,
      status,
      activeMoviePreference.anchorElement ?? null,
    );
    if (savedStatus) closeMoviePreferenceDialog();
  };

  const selectedDateLabel =
    view === "movies" && showAllMovieDates
      ? "今後1週間"
      : selectedDate === dates[0]
        ? "今日"
        : fullDateFormatter.format(
            new Date(`${selectedDate}T12:00:00+09:00`),
          );

  const renderScheduleTimeGroup = (
    group: (typeof timeGroups)[number],
    index: number,
  ) => (
    <Fragment key={group.time}>
      {index === currentTimeMarkerIndex && (
        <CurrentTimeMarker markerRef={currentTimeMarkerRef} now={now} />
      )}
      <section
        className="timeline-hour"
        id={`time-${group.time.replace(":", "-")}`}
        aria-labelledby={`time-label-${group.time.replace(":", "-")}`}
      >
        <div className="hour-label">
          <time
            id={`time-label-${group.time.replace(":", "-")}`}
            dateTime={`${selectedDate}T${group.time}:00+09:00`}
          >
            {group.label}
          </time>
          <small>{group.showingCount}上映</small>
        </div>
        <div className="hour-programs">
          {group.movies.map((movie) => {
            const presentation = getScheduleMoviePresentation(
              movie.showings,
              now,
              routeByCinema,
            );
            const isStarred = starredMovieKeys.has(movie.preferenceKey);
            return (
              <article
                className={scheduleProgramClassName({
                  isPast: presentation.isPast,
                  isReachable: presentation.isReachable,
                  isUnreachable: presentation.isUnreachable,
                  isStarred,
                  isLinked: selectedMovieKey === movie.preferenceKey,
                })}
                data-movie-key={movie.preferenceKey}
                key={movie.key}
              >
                <div className="program-title">
                  <h2>
                    {schedule?.preferencesEnabled ? (
                      <button
                        className="program-title-button"
                        type="button"
                        onClick={(event) =>
                          openMoviePreferenceDialog(
                            movie,
                            event.currentTarget.closest<HTMLElement>(
                              ".program-block",
                            ),
                          )
                        }
                      >
                        {movie.title}
                      </button>
                    ) : (
                      <a
                        href={hashForAppView("movies", {
                          date: selectedDate,
                          movie: movie.preferenceKey,
                          query: normalizedSearchQuery,
                        })}
                        onClick={navigateHashLink}
                      >
                        {movie.title}
                      </a>
                    )}
                  </h2>
                  {schedule?.preferencesEnabled && (
                    <FavoriteButton
                      title={movie.title}
                      isStarred={isStarred}
                      isSaving={savingMovieKeys.has(movie.preferenceKey)}
                      compact
                      onClick={() => void toggleMovieStar(movie)}
                    />
                  )}
                </div>
                <div
                  className="cinema-strip"
                  role="list"
                  aria-label={`${movie.title}の上映館`}
                >
                  {presentation.showings.map(
                    ({
                      showing,
                      isPast,
                      isReachable,
                      isUnreachable,
                      travelMinutes,
                    }) => {
                      return (
                        <CinemaSlot
                          key={showing.id}
                          showing={showing}
                          isPast={isPast}
                          isReachable={isReachable}
                          isUnreachable={isUnreachable}
                          travelMinutes={travelMinutes}
                          isPlanned={viewingPlans.some(
                            (plan) => plan.showingId === showing.id,
                          )}
                          isSaving={savingViewingPlanIds.has(showing.id)}
                          onToggle={toggleViewingPlan}
                        />
                      );
                    },
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </Fragment>
  );

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label="メニューを開く"
            aria-controls="primary-navigation"
            aria-expanded={isNavigationOpen}
            onClick={openNavigation}
          >
            <ListIcon size={21} aria-hidden="true" />
          </button>
        <a
          className="brand"
          href={hashForAppView("schedule", { date: today })}
          aria-label="今日の現在時刻の上映へ戻る"
          onClick={goHomeToCurrentTime}
          >
            <img
              className="brand-mark"
              src="/brand/hamamubi-icon-v2.svg"
              width="34"
              height="34"
              alt=""
              aria-hidden="true"
              fetchPriority="high"
            />
            <strong className="brand-wordmark" aria-hidden="true">
              はまむび！
            </strong>
          </a>
          <div className="header-status">
            <time dateTime={now.toISOString()}>{timeFormatter.format(now)}</time>
            <button
              className="icon-button theme-toggle-button"
              type="button"
              aria-label={colorThemeToggleLabel(theme)}
              title={colorThemeToggleLabel(theme)}
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : "dark";
                storeColorTheme(nextTheme);
                setHasExplicitTheme(true);
                setTheme(nextTheme);
              }}
            >
              {theme === "dark" ? (
                <SunIcon size={20} weight="fill" aria-hidden="true" />
              ) : (
                <MoonIcon size={20} weight="fill" aria-hidden="true" />
              )}
            </button>
            <form method="post" action="/auth/logout">
              <button
                className="icon-button"
                type="submit"
                aria-label="ログアウト"
              >
                <SignOutIcon size={19} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <dialog
        className="navigation-drawer"
        id="primary-navigation"
        ref={navigationDialogRef}
        aria-labelledby="navigation-title"
        onClose={() => setIsNavigationOpen(false)}
        onClick={(event) => {
          if (event.currentTarget === event.target) closeNavigation();
        }}
      >
        <div className="navigation-sheet">
          <div className="navigation-heading">
            <strong id="navigation-title">メニュー</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="メニューを閉じる"
              onClick={closeNavigation}
            >
              <XIcon size={20} aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="メイン">
            <a
              href={hashForAppView("schedule", { date: today })}
              className={view === "schedule" ? "active" : ""}
              aria-current={view === "schedule" ? "page" : undefined}
              onClick={goHomeFromNavigation}
            >
              <CalendarDotsIcon size={20} aria-hidden="true" />
              上映スケジュール
            </a>
            <a
              href={hashForAppView("movies", {
                date: selectedMovieListDate,
                movie: selectedMovieKey,
                query: normalizedSearchQuery,
              })}
              className={view === "movies" ? "active" : ""}
              aria-current={view === "movies" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <FilmSlateIcon size={20} aria-hidden="true" />
              上映作品
            </a>
            <a
              href={hashForAppView("cinemas")}
              className={view === "cinemas" ? "active" : ""}
              aria-current={view === "cinemas" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <BuildingsIcon size={20} aria-hidden="true" />
              横浜駅近くの映画館一覧
            </a>
            <a
              href={hashForAppView("viewingPlans")}
              className={view === "viewingPlans" ? "active" : ""}
              aria-current={view === "viewingPlans" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <CalendarDotsIcon size={20} aria-hidden="true" />
              鑑賞予定
            </a>
            <a
              href={hashForAppView("planner", {
                date: view === "planner" ? plannerDate : selectedDate,
              })}
              className={view === "planner" ? "active" : ""}
              aria-current={view === "planner" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <PathIcon size={20} aria-hidden="true" />
              映画はしごガチャ
            </a>
          <a
            href={hashForAppView("account")}
              className={view === "account" ? "active" : ""}
              aria-current={view === "account" ? "page" : undefined}
              onClick={closeNavigation}
            >
            <UserCircleIcon size={20} aria-hidden="true" />
            マイページ
          </a>
          <a
            href={hashForAppView("about")}
            className={view === "about" ? "active" : ""}
            aria-current={view === "about" ? "page" : undefined}
            onClick={closeNavigation}
          >
            <InfoIcon size={20} aria-hidden="true" />
            このサイトについて
          </a>
        </nav>
        </div>
      </dialog>

      <dialog
        className="movie-preference-dialog"
        ref={moviePreferenceDialogRef}
        closedby="any"
        aria-labelledby="movie-preference-title"
        onClose={() => setActiveMoviePreference(null)}
        onClick={(event) => {
          if (event.currentTarget !== event.target) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const isInside =
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
          if (!isInside) closeMoviePreferenceDialog();
        }}
      >
        {activeMoviePreference && (
          <div className="movie-preference-sheet">
            <div className="movie-preference-heading">
              <div>
                <small>作品の設定</small>
                <h2 id="movie-preference-title">
                  {activeMoviePreference.title}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="作品の設定を閉じる"
                onClick={closeMoviePreferenceDialog}
              >
                <XIcon size={20} aria-hidden="true" />
              </button>
            </div>
            <div
              className="movie-preference-actions"
              role="group"
              aria-label={`${activeMoviePreference.title}の状態`}
            >
              <button
                type="button"
                className={
                  starredMovieKeys.has(
                    activeMoviePreference.preferenceKey,
                  )
                    ? "favorite active"
                    : "favorite"
                }
                aria-pressed={starredMovieKeys.has(
                  activeMoviePreference.preferenceKey,
                )}
                disabled={savingMovieKeys.has(
                  activeMoviePreference.preferenceKey,
                )}
                onClick={() =>
                  void toggleMovieStar(activeMoviePreference)
                }
              >
                <StarIcon
                  size={20}
                  weight={
                    starredMovieKeys.has(
                      activeMoviePreference.preferenceKey,
                    )
                      ? "fill"
                      : "regular"
                  }
                  aria-hidden="true"
                />
                気になる
              </button>
              <button
                type="button"
                className={
                  movieStatusByKey.get(
                    activeMoviePreference.preferenceKey,
                  ) === "watched"
                    ? "active"
                    : ""
                }
                aria-pressed={
                  movieStatusByKey.get(
                    activeMoviePreference.preferenceKey,
                  ) === "watched"
                }
                disabled={savingMovieKeys.has(
                  activeMoviePreference.preferenceKey,
                )}
                onClick={() =>
                  void selectMovieStatusFromDialog("watched")
                }
              >
                鑑賞済み
              </button>
              <button
                type="button"
                className={
                  movieStatusByKey.get(
                    activeMoviePreference.preferenceKey,
                  ) === "not_interested"
                    ? "not-interested active"
                    : "not-interested"
                }
                aria-pressed={
                  movieStatusByKey.get(
                    activeMoviePreference.preferenceKey,
                  ) === "not_interested"
                }
                disabled={savingMovieKeys.has(
                  activeMoviePreference.preferenceKey,
                )}
                onClick={() =>
                  void selectMovieStatusFromDialog("not_interested")
                }
              >
                興味なし
              </button>
            </div>
            {preferenceError && (
              <p className="inline-status error" role="status">
                <WarningCircleIcon size={16} aria-hidden="true" />
                {preferenceError}
              </p>
            )}
          </div>
        )}
      </dialog>

      <main
        id="main"
        onClickCapture={handleMainClickCapture}
        onTouchStart={handleScheduleTouchStart}
        onTouchEnd={handleScheduleTouchEnd}
        onTouchCancel={() => {
          dateSwipeStartRef.current = null;
        }}
      >
        {(view === "schedule" || view === "movies") && (
        <nav className="date-nav" aria-label="上映日">
          <div className="date-strip">
            {view === "movies" && (
              <a
                className={
                  showAllMovieDates
                    ? "day-button active"
                    : "day-button"
                }
                href={hashForAppView("movies", {
                  query: normalizedSearchQuery,
                })}
                aria-current={showAllMovieDates ? "page" : undefined}
              >
                <span>すべて</span>
                <small>1週間</small>
              </a>
            )}
            {dates.map((date, index) => {
              const displayDate = dayFormatter.format(
                new Date(`${date}T12:00:00+09:00`),
              );
              const [monthDay, weekday = ""] = displayDate.split(/[()]/);
              return (
                <a
                  key={date}
                  className={
                    !showAllMovieDates && date === selectedDate
                      ? "day-button active"
                      : "day-button"
                  }
                  href={hashForAppView(view, {
                    date,
                    query: normalizedSearchQuery,
                  })}
                  aria-current={
                    !showAllMovieDates && date === selectedDate
                      ? "date"
                      : undefined
                  }
                >
                  <span>{index === 0 ? "今日" : monthDay}</span>
                  <small>{weekday}</small>
                </a>
              );
            })}
          </div>
          </nav>
        )}

        {(view === "schedule" || view === "movies") && (
          <search className="schedule-search">
            <form
              className="schedule-search-form"
              method="get"
              onSubmit={submitScheduleSearch}
            >
              <div className="schedule-search-field">
                <label htmlFor="schedule-search-query">
                  作品名・映画館名
                </label>
                <span className="schedule-search-input">
                  <MagnifyingGlassIcon size={18} aria-hidden="true" />
                  <input
                    id="schedule-search-query"
                    type="search"
                    name="q"
                    value={searchDraft}
                    placeholder="例：スパイダーマン、TOHOシネマズ"
                    autoComplete="off"
                    enterKeyHint="search"
                    onChange={(event) => setSearchDraft(event.target.value)}
                  />
                  {normalizedSearchQuery && (
                    <button
                      className="schedule-search-clear"
                      type="button"
                      aria-label="検索条件を解除"
                      onClick={clearScheduleSearch}
                    >
                      <XIcon size={17} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
              <button className="schedule-search-submit" type="submit">
                検索
              </button>
            </form>
            {interactiveSearchQuery && (
              <p className="schedule-search-result" role="status">
                「{interactiveSearchQuery}」で絞り込み中
              </p>
            )}
          </search>
        )}

      {(view === "schedule" ||
        view === "movies" ||
        view === "cinemas") && (
        <section className="schedule-controls" aria-label="上映の絞り込み">
          <div className="area-strip" role="group" aria-label="エリア">
            {AREA_OPTIONS.map((area) => (
              <button
                key={area.id}
                type="button"
                className={
                  selectedArea === area.id ? "filter-chip active" : "filter-chip"
                }
                aria-pressed={selectedArea === area.id}
                onClick={() => setSelectedArea(area.id)}
              >
                {area.label}
              </button>
            ))}
          </div>

          <div className="control-row">
            {view === "schedule" && selectedDate === dates[0] ? (
              <div className="time-filter" role="group" aria-label="時間">
                <button
                  type="button"
                  aria-pressed={futureOnly}
                  className={futureOnly ? "active" : ""}
                  onClick={() => setFutureOnly(true)}
                >
                  これから
                </button>
                <button
                  type="button"
                  aria-pressed={!futureOnly}
                  className={!futureOnly ? "active" : ""}
                  onClick={() => setFutureOnly(false)}
                >
                  全時間
                </button>
              </div>
            ) : view === "schedule" ? (
              <span className="all-day-label">全時間を表示</span>
            ) : view === "movies" ? (
              <span className="all-day-label">
                {schedule?.preferencesEnabled
                  ? "スター済みを先頭に表示"
                  : "作品名順に表示"}
              </span>
            ) : (
              <span className="all-day-label">
                移動方法と自分の所要時間を保存
              </span>
            )}
          </div>

          {view !== "movies" && userProfile.departureRegistered && (
            <p
              className={[
                "inline-status",
                routeState === "error" ? "error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="status"
            >
              {routeState === "error" ? (
                <WarningCircleIcon size={16} aria-hidden="true" />
              ) : (
                <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />
              )}
              {routeState === "loading"
                ? "ベース出発地点からの移動時間を読み込んでいます"
                : routeState === "error"
                  ? "ベース出発地点からの移動時間を読み込めませんでした"
                  : "ベース出発地点からの固定移動時間を反映しています"}
            </p>
          )}
          {view !== "movies" && !userProfile.departureRegistered && (
            <a
              className="home-profile-link"
              href={hashForAppView("account")}
            >
              <HouseLineIcon size={16} aria-hidden="true" />
              マイページでベース出発地点を登録
            </a>
          )}
          {cinemaPreferenceError && (
            <p className="inline-status error" role="status">
              <WarningCircleIcon size={16} aria-hidden="true" />
              {cinemaPreferenceError}
            </p>
          )}
          {preferenceError && (
            <p className="inline-status error" role="status">
              <WarningCircleIcon size={16} aria-hidden="true" />
              {preferenceError}
            </p>
          )}
        </section>
        )}

      {view === "account" ? (
        <AccountPage
            profileSettings={
              !loading && !error ? (
                <ProfilePanel
                  enabled={Boolean(schedule?.userProfileEnabled)}
                  profile={userProfile}
                  state={profileState}
                  collapseState={collapsePreferenceState}
                  error={profileError}
                  onRegister={() => void registerDepartureLocation()}
                  onDelete={() => void deleteDepartureProfile()}
                  onCollapseChange={(value) =>
                    void saveScheduleCollapsePreference(value)
                  }
                />
              ) : null
            }
          />
      ) : view === "viewingPlans" ? (
        <ViewingPlansPage
          plans={viewingPlans}
          starredMovieKeys={starredMovieKeys}
          loading={viewingPlansState === "loading"}
          error={viewingPlanError}
          savingIds={savingViewingPlanIds}
          onRemove={removeViewingPlan}
        />
      ) : view === "planner" ? (
        <PlannerPage
            selectedDate={plannerDate}
            onSelectedDateChange={(date) => {
              window.location.hash = hashForAppView("planner", { date });
            }}
          />
      ) : view === "about" ? (
        <AboutPage />
      ) : (
        <PageShell className="guide" live="polite" busy={loading}>
          <PageHeader
            eyebrow={view === "cinemas" ? "対象エリア" : selectedDateLabel}
            title={
              view === "schedule"
                ? "上映スケジュール"
                : view === "movies"
                  ? "上映中の作品"
                  : "映画館"
            }
            meta={
              !loading &&
              !error && (
                <span className="page-count">
                  {view === "schedule"
                    ? `${movieCount}作品`
                    : view === "movies"
                      ? `${movieList.length}作品`
                      : `${cinemaList.length}館`}
                  {view === "schedule" && (
                    <small>{visibleShowings.length}上映</small>
                  )}
                </span>
              )
            }
          />

          {schedule?.lastUpdatedAt && !loading && (
            <p className="update-status">
              {updatedFormatter.format(new Date(schedule.lastUpdatedAt))}更新
              {schedule.sourceHealth.total > 0 &&
                schedule.sourceHealth.healthy < schedule.sourceHealth.total &&
                ` / ${schedule.sourceHealth.total - schedule.sourceHealth.healthy}館は更新確認できず`}
            </p>
          )}

          {loading && view === "schedule" && <LoadingTimeline />}
          {!loading && error && (
            <div className="state-card error-state" role="alert">
              <WarningCircleIcon size={25} aria-hidden="true" />
              <div>
                <strong>読み込みに失敗しました</strong>
                <p>{error}</p>
              </div>
              <button type="button" onClick={() => window.location.reload()}>
                再読み込み
              </button>
            </div>
          )}
          {!loading &&
            !error &&
            (view === "schedule"
              ? timeGroups.length === 0
              : view === "movies"
                ? movieList.length === 0
                : cinemaList.length === 0) && (
              <div className="state-card">
                <ClockIcon size={25} aria-hidden="true" />
                <div>
                  <strong>
                    {view === "schedule"
                      ? "条件に合う上映がありません"
                      : view === "movies"
                        ? "上映中の作品がありません"
                        : "対象の映画館がありません"}
                  </strong>
                  <p>
                    {interactiveSearchQuery &&
                      (view === "schedule" || view === "movies")
                      ? "作品名や映画館名を変えて検索してください。"
                      : view === "cinemas"
                        ? "エリアを広げてください。"
                        : "エリアを広げるか、別の日を選んでください。"}
                  </p>
                </div>
              </div>
          )}
          {!loading && !error && view === "movies" && movieList.length > 0 && (
            <>
              <p className="movie-release-source">
                日本公開日の情報：
                <a
                  href="https://www.themoviedb.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  TMDB
                </a>
              </p>
              <ul className="movie-list">
                {movieList.map((movie, index) => {
                const isStarred = starredMovieKeys.has(movie.preferenceKey);
                const status =
                  movieStatusByKey.get(movie.preferenceKey) ?? null;
                const externalLinks = buildMovieExternalLinks(movie.title);
                const releaseDateLabel = movie.releaseDate
                  ? dayFormatter.format(
                      new Date(`${movie.releaseDate}T12:00:00+09:00`),
                    )
                  : null;
                const showingDateLabels = listMovieShowingDates(
                  movie.showings,
                ).map((date) => {
                  if (date === today) return "今日";
                  return dayFormatter
                    .format(new Date(`${date}T12:00:00+09:00`))
                    .split(/[()]/)[0];
                });
                return (
                  <li
                    className={[
                      "movie-list-item",
                      isStarred ? "starred" : "",
                      status === "watched" ? "watched" : "",
                      status === "not_interested"
                        ? "not-interested"
                        : "",
                      selectedMovieKey === movie.preferenceKey ? "linked" : "",
                      schedule?.preferencesEnabled
                        ? ""
                        : "preferences-disabled",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-movie-key={movie.preferenceKey}
                    key={movie.preferenceKey}
                  >
                    {movie.imageUrl ? (
                      <img
                        src={movie.imageUrl}
                        alt=""
                        width="104"
                        height="66"
                        loading={index < 3 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    ) : (
                      <div className="movie-image-placeholder" aria-hidden="true">
                        {movie.title.slice(0, 1)}
                      </div>
                    )}
                    <div className="movie-list-copy">
                      <strong>
                        <a
                          href={hashForAppView("movies", {
                            date: selectedMovieListDate,
                            movie: movie.preferenceKey,
                            query: normalizedSearchQuery,
                          })}
                          onClick={navigateHashLink}
                          aria-current={
                            selectedMovieKey === movie.preferenceKey
                              ? "location"
                              : undefined
                          }
                        >
                          {movie.title}
                        </a>
                      </strong>
                      {movie.releaseDate && releaseDateLabel && (
                        <p
                          className="movie-release-date"
                          aria-label={`${movie.title}の日本公開日`}
                        >
                          <CalendarDotsIcon size={13} aria-hidden="true" />
                          <time dateTime={movie.releaseDate}>
                            日本公開 {releaseDateLabel}
                          </time>
                        </p>
                      )}
                      <div
                        className="movie-external-links"
                        aria-label={`${movie.title}の作品情報`}
                      >
                        <a
                          href={externalLinks.eiga}
                          target="_blank"
                          rel="noreferrer"
                        >
                          映画.com
                          <ArrowSquareOutIcon
                            size={12}
                            aria-hidden="true"
                          />
                        </a>
                        <a
                          href={externalLinks.filmarks}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Filmarks
                          <ArrowSquareOutIcon
                            size={12}
                            aria-hidden="true"
                          />
                        </a>
                      </div>
                      {showAllMovieDates && (
                        <p
                          className="movie-showing-dates"
                          aria-label={`${movie.title}の上映日`}
                        >
                          <CalendarDotsIcon size={13} aria-hidden="true" />
                          {showingDateLabels.join("・")}
                        </p>
                      )}
                    </div>
                    {schedule?.preferencesEnabled && (
                      <FavoriteButton
                        title={movie.title}
                        isStarred={isStarred}
                        isSaving={savingMovieKeys.has(movie.preferenceKey)}
                        onClick={() => void toggleMovieStar(movie)}
                      />
                    )}
                    {schedule?.preferencesEnabled && (
                      <div
                        className="movie-status-actions"
                        role="group"
                        aria-label={`${movie.title}の鑑賞状態`}
                      >
                        <button
                          type="button"
                          className={
                            status === "watched" ? "active" : ""
                          }
                          aria-pressed={status === "watched"}
                          disabled={savingMovieKeys.has(
                            movie.preferenceKey,
                          )}
                          onClick={(event) =>
                            void updateMovieStatus(
                              movie,
                              "watched",
                              event.currentTarget.closest<HTMLElement>(
                                ".movie-list-item",
                              ),
                            )
                          }
                        >
                          鑑賞済み
                        </button>
                        <button
                          type="button"
                          className={
                            status === "not_interested"
                              ? "active"
                              : ""
                          }
                          aria-pressed={status === "not_interested"}
                          disabled={savingMovieKeys.has(
                            movie.preferenceKey,
                          )}
                          onClick={(event) =>
                            void updateMovieStatus(
                              movie,
                              "not_interested",
                              event.currentTarget.closest<HTMLElement>(
                                ".movie-list-item",
                              ),
                            )
                          }
                        >
                          興味なし
                        </button>
                      </div>
                    )}
                  </li>
                );
                })}
              </ul>
            </>
          )}
          {!loading &&
            !error &&
            view === "cinemas" &&
            cinemaList.length > 0 && (
              <ul className="cinema-list">
                {cinemaList.map((cinema) => {
                  const route = routeByCinema.get(cinema.id);
                  const travelMode =
                    cinemaTravelModes.get(cinema.id) ?? "transit";
                  const customDuration =
                    cinemaCustomDurations.get(cinema.id) ?? null;
                  const durationDraft =
                    cinemaDurationDrafts.get(cinema.id) ?? "";
                  const savedNote = cinemaNotes.get(cinema.id) ?? "";
                  const noteDraft = cinemaNoteDrafts.get(cinema.id) ?? "";
                  const isSaving = savingCinemaIds.has(cinema.id);
                  return (
                    <li className="cinema-list-item" key={cinema.id}>
                      <div className="cinema-list-heading">
                        <h2>
                          {cinema.name}
                          {cinema.activeUntil && (
                            <span className="cinema-closure-date">
                              （
                              {closureDateFormatter.format(
                                new Date(
                                  `${cinema.activeUntil}T12:00:00+09:00`,
                                ),
                              )}
                              閉館予定）
                            </span>
                          )}
                        </h2>
                        <p>
                          <MapPinIcon size={15} aria-hidden="true" />
                          {cinema.areaLabel}
                        </p>
                      </div>
                      <CinemaExteriorThumbnail cinema={cinema} />
                      {route && (
                        <div className="cinema-route-actions">
                          <strong className="cinema-route-time">
                            約{route.durationMinutes}分
                            <small>{routeEstimateDetail(route)}</small>
                          </strong>
                          <GoogleMapsRouteLink
                            cinema={cinema}
                            route={route}
                          />
                        </div>
                      )}
                      <p className="cinema-address">{cinema.address}</p>
                      {route?.transitDetails && (
                        <p className="cinema-transit-breakdown">
                          {transitRouteSummary(route)}
                        </p>
                      )}
                      <div className="cinema-preference-row">
                        <label htmlFor={`travel-mode-${cinema.id}`}>
                          移動方法
                        </label>
                        <select
                          id={`travel-mode-${cinema.id}`}
                          value={travelMode}
                          disabled={
                            isSaving ||
                            !schedule?.cinemaTravelPreferencesEnabled
                          }
                          onChange={(event) =>
                            void saveCinemaTravelMode(
                              cinema.id,
                              event.target.value as TravelMode,
                              event.currentTarget.closest<HTMLElement>(
                                ".cinema-list-item",
                              ),
                            )
                          }
                        >
                          {TRAVEL_MODE_OPTIONS.map((option) => (
                            <option value={option.value} key={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span aria-live="polite">
                          {isSaving ? "保存中" : "保存済み"}
                        </span>
                      </div>
                      <div className="cinema-duration-row">
                        <label htmlFor={`custom-duration-${cinema.id}`}>
                          自分の所要時間
                        </label>
                        <div className="duration-input">
                          <input
                            id={`custom-duration-${cinema.id}`}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="1440"
                            step="1"
                            placeholder={
                              route?.calculatedDurationMinutes?.toString() ??
                              route?.durationMinutes.toString() ??
                              "30"
                            }
                            value={durationDraft}
                            disabled={
                              isSaving ||
                              !schedule?.cinemaTravelPreferencesEnabled
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              setCinemaDurationDrafts((current) => {
                                const next = new Map(current);
                                next.set(cinema.id, value);
                                return next;
                              });
                            }}
                          />
                          <span>分</span>
                        </div>
                        <button
                          type="button"
                          disabled={
                            isSaving ||
                            !schedule?.cinemaTravelPreferencesEnabled ||
                            durationDraft === customDuration?.toString()
                          }
                          onClick={(event) =>
                            saveCinemaDurationDraft(
                              cinema.id,
                              event.currentTarget.closest<HTMLElement>(
                                ".cinema-list-item",
                              ),
                            )
                          }
                        >
                          保存
                        </button>
                        {customDuration !== null && (
                          <button
                            type="button"
                            className="duration-reset"
                            disabled={isSaving}
                            onClick={(event) =>
                              void saveCinemaCustomDuration(
                                cinema.id,
                                null,
                                event.currentTarget.closest<HTMLElement>(
                                  ".cinema-list-item",
                                ),
                              )
                            }
                          >
                            自動に戻す
                          </button>
                        )}
                        <small>
                          保存した分数を表示と「間に合う」判定に使います
                        </small>
                      </div>
                      <div className="cinema-note-row">
                        <label htmlFor={`cinema-note-${cinema.id}`}>
                          館内・座席メモ
                        </label>
                        <textarea
                          id={`cinema-note-${cinema.id}`}
                          rows={3}
                          maxLength={2000}
                          placeholder="例：シアター3は中央のG〜I列が見やすい"
                          value={noteDraft}
                          disabled={
                            isSaving ||
                            !schedule?.cinemaTravelPreferencesEnabled
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setCinemaNoteDrafts((current) => {
                              const next = new Map(current);
                              next.set(cinema.id, value);
                              return next;
                            });
                          }}
                        />
                        <div className="cinema-note-actions">
                          <small>{noteDraft.length}/2000</small>
                          <button
                            type="button"
                            disabled={isSaving || noteDraft.trim() === savedNote}
                            onClick={(event) =>
                              void saveCinemaNote(
                                cinema.id,
                                event.currentTarget.closest<HTMLElement>(
                                  ".cinema-list-item",
                                ),
                              )
                            }
                          >
                            {isSaving ? "保存中" : "メモを保存"}
                          </button>
                        </div>
                      </div>
                      <a
                        className="cinema-official-link"
                        href={cinema.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        公式サイト
                        <ArrowSquareOutIcon size={16} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          {!loading &&
            !error &&
            view === "schedule" &&
            timeGroups.length > 0 && (
            <div className="timeline">
              {userProfile.scheduleCollapseMinutes === 0
                ? timeGroups.map(renderScheduleTimeGroup)
                : scheduleTimeBuckets.map((bucket) => {
                    const markerGroup =
                      currentTimeMarkerIndex >= 0
                        ? timeGroups[currentTimeMarkerIndex]
                        : null;
                    const containsCurrentMarker = Boolean(
                      markerGroup &&
                        bucket.groups.some(
                          (group) => group.time === markerGroup.time,
                        ),
                    );
                    const defaultOpen = shouldExpandScheduleBucket(
                      interactiveSearchQuery,
                      containsCurrentMarker ||
                        shouldDefaultExpandScheduleBucket(
                          bucket,
                          now,
                          selectedDate,
                          today,
                        ),
                    );
                    return (
                      <details
                        className="schedule-window"
                        key={`${selectedDate}-${userProfile.scheduleCollapseMinutes}-${bucket.key}`}
                        open={defaultOpen || undefined}
                      >
                        <summary>
                          <span>{bucket.label}</span>
                          <small>
                            {bucket.movieCount}作品 / {bucket.showingCount}上映
                          </small>
                        </summary>
                        <div className="schedule-window-content">
                          {bucket.groups.map((group) =>
                            renderScheduleTimeGroup(
                              group,
                              timeGroups.indexOf(group),
                            ),
                          )}
                        </div>
                      </details>
                    );
                  })}
              {showCurrentTimeMarkerAtEnd && (
                <CurrentTimeMarker
                  markerRef={currentTimeMarkerRef}
                  now={now}
                />
              )}
            </div>
          )}
        </PageShell>
      )}
      </main>

      {showJumpToNow && (
        <button
          type="button"
          className="jump-to-now-button"
          aria-label="現在時刻の上映位置へ移動"
          onClick={jumpToCurrentTime}
        >
          <ClockIcon size={18} weight="bold" aria-hidden="true" />
          今の上映へ
        </button>
      )}

      <footer>
        <p>
          上映時刻は参考情報です。購入前に各映画館の公式サイトでご確認ください。
        </p>
      </footer>
    </>
  );
}

function CurrentTimeMarker({
  markerRef,
  now,
}: {
  markerRef: React.RefObject<HTMLDivElement | null>;
  now: Date;
}) {
  return (
    <div
      className="current-time-marker"
      ref={markerRef}
      aria-label={`現在時刻 ${timeFormatter.format(now)}`}
    >
      <time dateTime={now.toISOString()}>現在 {timeFormatter.format(now)}</time>
      <span aria-hidden="true" />
    </div>
  );
}

function CinemaExteriorThumbnail({ cinema }: { cinema: Cinema }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!("IntersectionObserver" in window)) {
      setIsOpen(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsOpen(true);
        observer.disconnect();
      },
      {
        rootMargin: "200px 0px",
        threshold: 0.01,
      },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={containerRef}
      className={`cinema-exterior${isOpen ? " cinema-exterior-open" : ""}`}
    >
      {isOpen ? (
        <>
          <iframe
            className="cinema-street-view-frame"
            src={`/api/cinema-exterior/${encodeURIComponent(cinema.id)}`}
            title={`${cinema.name}のGoogle Street View`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <button
            type="button"
            className="cinema-street-view-close"
            onClick={() => setIsOpen(false)}
          >
            閉じる
          </button>
        </>
      ) : (
        <button
          type="button"
          className="cinema-exterior-placeholder"
          onClick={() => setIsOpen(true)}
          aria-label={`${cinema.name}のStreet Viewを今すぐ読み込む`}
        >
          <BuildingsIcon size={28} />
          <strong>Street Viewを読み込む</strong>
          <span>表示位置までスクロールすると自動で読み込みます</span>
        </button>
      )}
      <figcaption>Google Street View</figcaption>
    </figure>
  );
}

function FavoriteButton({
  title,
  isStarred,
  isSaving,
  compact = false,
  onClick,
}: {
  title: string;
  isStarred: boolean;
  isSaving: boolean;
  compact?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className={[
        "favorite-button",
        isStarred ? "starred" : "",
        compact ? "compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${title}を${isStarred ? "スターから外す" : "スターする"}`}
      aria-pressed={isStarred}
      disabled={isSaving}
      onClick={onClick}
    >
      <StarIcon
        size={compact ? 18 : 22}
        weight={isStarred ? "fill" : "regular"}
        aria-hidden="true"
      />
    </button>
  );
}

function ProfilePanel({
  enabled,
  profile,
  state,
  collapseState,
  error,
  onRegister,
  onDelete,
  onCollapseChange,
}: {
  enabled: boolean;
  profile: UserProfile;
  state: "idle" | "saving" | "deleting";
  collapseState: "idle" | "saving" | "saved";
  error: string | null;
  onRegister: () => void;
  onDelete: () => void;
  onCollapseChange: (value: ScheduleCollapseMinutes) => void;
}) {
  const isBusy = state !== "idle";
  return (
    <section
      className="profile-panel"
      aria-labelledby="departure-profile-title"
    >
      <div className="profile-icon" aria-hidden="true">
        <HouseLineIcon size={27} />
      </div>
      <div className="profile-copy">
        <h2 id="departure-profile-title">
          {profile.departureRegistered
            ? "ベース出発地点を登録済み"
            : "ベース出発地点を登録"}
        </h2>
        <p>
          {profile.departureRegistered
            ? "映画館までの時間は、登録したベース出発地点を基準に固定して表示します。"
            : "現在地を一度登録すると、次回からGPSを取得せず同じ移動時間を表示します。"}
        </p>
        {profile.departureUpdatedAt && (
          <small>
            {updatedFormatter.format(new Date(profile.departureUpdatedAt))}
            登録
          </small>
        )}
      </div>
      <aside className="profile-location-notice">
        <WarningCircleIcon size={20} weight="fill" aria-hidden="true" />
        <p>
          映画館に向かうためのいつもの出発地点を登録してください。出発地点を登録しなくても、各映画館までの時間は手動でも登録可能です。
        </p>
      </aside>
      <div className="profile-display-setting">
        <label htmlFor="schedule-collapse-minutes">
          上映時間の折りたたみ
        </label>
        <select
          id="schedule-collapse-minutes"
          value={profile.scheduleCollapseMinutes}
          disabled={!enabled || collapseState === "saving"}
          onChange={(event) =>
            onCollapseChange(
              Number(event.currentTarget.value) as ScheduleCollapseMinutes,
            )
          }
        >
          <option value={0}>なし</option>
          <option value={30}>30分</option>
          <option value={60}>1時間</option>
        </select>
        <small className="profile-save-status" aria-live="polite">
          {collapseState === "saving"
            ? "保存中"
            : collapseState === "saved"
              ? "保存しました"
              : "端末間で共有されます"}
        </small>
      </div>
      <button
        type="button"
        className="profile-primary-action"
        disabled={!enabled || isBusy}
        onClick={onRegister}
      >
        <CrosshairIcon size={18} aria-hidden="true" />
        {state === "saving"
          ? "登録中"
          : profile.departureRegistered
            ? "現在地でベース出発地点を更新"
            : "現在地をベース出発地点として登録"}
      </button>
      <p className="profile-privacy-note">
        GPSはこの操作時だけ使用します。座標は約10m単位に丸め、ユーザーごとの鍵で暗号化して保存し、通常の画面や一覧APIには返しません。
      </p>
      {profile.departureRegistered && (
        <button
          type="button"
          className="profile-delete-action"
          disabled={isBusy}
          onClick={onDelete}
        >
          <TrashIcon size={15} aria-hidden="true" />
          {state === "deleting" ? "削除中" : "ベース出発地点を削除"}
        </button>
      )}
      {!enabled && (
        <p className="inline-status error">公開モードでは利用できません</p>
      )}
      {error && (
        <p className="inline-status error" role="status">
          <WarningCircleIcon size={16} aria-hidden="true" />
          {error}
        </p>
      )}
    </section>
  );
}

function routeTravelLabel(route: RouteEstimate): string {
  const labels: Record<TravelMode, string> = {
    walking: "徒歩",
    transit: "電車",
    bus: "バス",
    bicycle: "自転車",
  };
  return labels[route.travelMode];
}

function routeEstimateDetail(route: RouteEstimate): string {
  if (route.customDurationMinutes !== undefined) {
    return route.calculatedDurationMinutes === undefined
      ? "ユーザー設定"
      : `ユーザー設定 / 自動目安${route.calculatedDurationMinutes}分`;
  }
  if (route.transitDetails) {
    return `${route.transitDetails.originStationName}→${route.transitDetails.destinationStationName}`;
  }
  return route.travelMode === "transit"
    ? "駅徒歩・待ち・余裕10分込みの目安"
    : `${routeTravelLabel(route)}の目安`;
}

function transitRouteSummary(route: RouteEstimate): string {
  const details = route.transitDetails;
  if (!details) {
    return "";
  }
  const stationSegment =
    details.stationTravelMinutes === 0
      ? `${details.destinationStationName}を利用`
      : `${details.originStationName}→${details.destinationStationName} ${details.stationTravelMinutes}分（平均待ち込）`;
  const calculatedLabel =
    route.customDurationMinutes !== undefined &&
    route.calculatedDurationMinutes !== undefined
      ? `自動目安${route.calculatedDurationMinutes}分：`
      : "";
  return `${calculatedLabel}駅まで徒歩${details.originWalkMinutes}分・${stationSegment}・映画館まで徒歩${details.destinationWalkMinutes}分・余裕${details.bufferMinutes}分`;
}

function GoogleMapsRouteLink({
  cinema,
  route,
}: {
  cinema: Cinema;
  route: RouteEstimate;
}) {
  return (
    <a
      className="google-maps-route-link"
      href={`/api/route-guidance/${encodeURIComponent(cinema.id)}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`${cinema.name}までの${routeTravelLabel(route)}経路をGoogle マップで開く`}
    >
      Googleマップで案内
      <ArrowSquareOutIcon size={12} aria-hidden="true" />
    </a>
  );
}

function CinemaSlot({
  showing,
  isPast,
  isReachable,
  isUnreachable,
  travelMinutes,
  isPlanned,
  isSaving,
  onToggle,
}: {
  showing: Showing;
  isPast: boolean;
  isReachable: boolean;
  isUnreachable: boolean;
  travelMinutes: number | null;
  isPlanned: boolean;
  isSaving: boolean;
  onToggle(showing: Showing): Promise<"added" | "removed" | null>;
}) {
  const [feedback, setFeedback] = useState<"added" | "removed" | null>(null);
  const start = timeFormatter.format(new Date(showing.startsAt));
  const end = showing.endsAt
    ? timeFormatter.format(new Date(showing.endsAt))
    : null;
  const metadata = [showing.screen, showing.format].filter(Boolean).join(" / ");
  const reachableLabel = isReachable
    ? travelMinutes === null
      ? "間に合う"
      : formatReachableLabel(travelMinutes)
    : null;

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const toggle = async () => {
    const result = await onToggle(showing);
    if (result) setFeedback(result);
  };

  return (
    <div
      className={[
        "cinema-slot",
        isPast ? "past" : "",
        isReachable ? "reachable" : "",
        isUnreachable ? "unreachable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="listitem"
    >
      <a
        className="cinema-slot-booking"
        href={showing.bookingUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${isPast ? "開始済み " : ""}${reachableLabel ? `${reachableLabel} ` : ""}${isUnreachable ? "移動時間では間に合わない " : ""}${start} ${showing.cinemaShortName}の公式予約ページを開く`}
      >
        <div className="slot-time">
          <strong>{start}</strong>
          <span className="slot-time-details">
            {end && <span>{end}終了</span>}
            {isPast && <span className="started-label">開始済み</span>}
            {reachableLabel && (
              <span className="reachable-label">{reachableLabel}</span>
            )}
            {isUnreachable && (
              <span className="unreachable-label">間に合わない</span>
            )}
          </span>
        </div>
        <div className="slot-cinema">
          <strong>{showing.cinemaShortName}</strong>
          <ArrowSquareOutIcon size={15} aria-hidden="true" />
        </div>
        {metadata && <span className="slot-meta">{metadata}</span>}
      </a>
      <button
        type="button"
        className={[
          "viewing-plan-toggle",
          isPlanned ? "planned" : "",
          feedback ? "confirmed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={isPlanned}
        aria-label={`${showing.title} ${start} ${showing.cinemaShortName}を鑑賞予定${isPlanned ? "から外す" : "に追加"}`}
        disabled={isPast || isSaving}
        onClick={() => void toggle()}
      >
        <img
          src={
            feedback
              ? "/brand/hamamubi-icon-wink.svg"
              : "/brand/hamamubi-icon-v2.svg"
          }
          alt=""
        />
        <span className="viewing-plan-toggle-label">
          {isSaving ? "保存中" : isPlanned ? "予定済" : "観に行く"}
        </span>
        {feedback && (
          <span
            className="viewing-plan-feedback"
            role="status"
            aria-live="polite"
          >
            {feedback === "added" ? "チェックしたよ！" : "予定から外したよ"}
          </span>
        )}
      </button>
    </div>
  );
}

function LoadingTimeline() {
  return (
    <div className="timeline loading-timeline" aria-label="読み込み中">
      {[9, 10, 11].map((hour) => (
        <div className="timeline-hour" key={hour}>
          <div className="hour-label">
            <time>{hour}:00</time>
          </div>
          <div className="hour-programs">
            <div className="program-block skeleton-program">
              <span />
              <div>
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
