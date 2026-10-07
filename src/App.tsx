import { splitScreeningFormat } from "../shared/screening-format";
import { ScreeningFormat, screeningLanguageSuffix } from "./ScreeningFormat";
import { CollectionStatusPage } from "./CollectionStatusPage";
import { useCollectionCounts } from "./useCollectionCounts";
import { ScheduleNavigator } from "./ScheduleNavigator";
import { WatchlistNote } from "./WatchlistNote";
import { activeMetrics } from "./performanceMetrics";
import { MemberPage } from "./MemberPage";
import { ProfileMenu } from "./MemberProfile";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { movieTitle, screeningInfo } from "./i18n";
import {
  useLanguage,
  localeCode,
  useUserRole,
  saveLanguage,
  registerTitleTranslations,
  englishText,
} from "./i18n";
import { MoviePage } from "./MoviePage";
import { MovieActions, MovieStarButton } from "./MovieActions";
import { MovieTimes } from "./MovieTimes";
import { useDateSwipe } from "./useDateSwipe";
import { useHistoryScroll } from "./useHistoryScroll";
import { useLanguageScroll } from "./useLanguageScroll";
import { localize, localizedDate } from "./i18n";
import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  ClockIcon,
  FilmSlateIcon,
  HouseLineIcon,
  InfoIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MoonIcon,
  MoonStarsIcon,
  PathIcon,
  StarIcon,
  SunDimIcon,
  SunHorizonIcon,
  SunIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  Fragment,
  type FormEvent,
  type MouseEvent,
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
  getAvailableAreaOptions,
  COLOR_THEME_STORAGE_KEY,
  MOVIE_HIDE_CONFIRMATION,
  appHashStateFromHash,
  buildMovieExternalLinks,
  buildDates,
  colorThemeToggleLabel,
  filterShowings,
  findCurrentTimeMarkerIndex,
  formatReachableLabel,
  formatUnreachableLabel,
  groupByScheduleTime,
  groupScheduleTimeBuckets,
  groupByMovie,
  getAppPageScrollTarget,
  getScheduleMoviePresentation,
  getScheduleTimeJumpTargets,
  getViewingPlanButtonState,
  hashForAppView,
  listMovieShowingDates,
  normalizeMovieTitle,
  parseColorTheme,
  resolveColorTheme,
  scrollPageToTop,
  scrollToInitialTimeMarker,
  scheduleProgramClassName,
  scheduleTimePeriodForTime,
  SCHEDULE_TIME_PERIODS,
  shouldDefaultExpandScheduleBucket,
  shouldExpandScheduleBucket,
  shouldShowScheduleTimeJumps,
  type AppView,
  type ColorTheme,
  type ScheduleTimePeriod,
} from "./lib";
import { PlannerPage } from "./PlannerPage";
import { AdminCollectionPage } from "./AdminCollectionPage";
import { AdminUsersPage } from "./AdminUsersPage";
import { AccountPage } from "./AccountPage";
import { AboutPage } from "./AboutPage";
import { PageHeader, PageShell } from "./PageLayout";
import { NotificationsPage } from "./Notifications";
import { SharedPage } from "./SharedPage";
import { ViewingPlansPage } from "./ViewingPlansPage";

const timeFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const fullDateFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const closureDateFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const updatedFormatter = localizedDate({
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
    return parseColorTheme(
      window.localStorage.getItem(COLOR_THEME_STORAGE_KEY),
    );
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
  const language = useLanguage();
  const captureLanguageScroll = useLanguageScroll(language);
  const userRole = useUserRole();
  const collectionCounts = useCollectionCounts(userRole === "admin");
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState("");
  async function changeLanguage(value: "ja" | "en") {
    setLanguageSaving(true);
    setLanguageError("");
    try {
      await saveLanguage(value, captureLanguageScroll);
    } catch {
      setLanguageError("言語設定を保存できませんでした。");
    } finally {
      setLanguageSaving(false);
    }
  }

  useEffect(() => { activeMetrics?.commit(); });
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
  const dateStripRef = useRef<HTMLDivElement>(null);
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
  const [areaSearchOpen, setAreaSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(initialHashState.query);
  const normalizedSearchQuery = normalizeSearchQuery(searchDraft);
  const interactiveSearchQuery = useDeferredValue(normalizedSearchQuery);
  const [plannerDate, setPlannerDate] = useState(initialPlannerDate);
  const [selectedMovieKey, setSelectedMovieKey] = useState<string | null>(
    initialHashState.view === "schedule" ||
      initialHashState.view === "movies" ||
      initialHashState.view === "movie"
      ? initialHashState.movie
      : null,
  );
  const [selectedArea, setSelectedArea] = useState<CinemaArea | "all">("all");
  const [selectedMemberId, setSelectedMemberId] = useState(initialHashState.user ?? "");
  const [selectedShowingId, setSelectedShowingId] = useState(initialHashState.showing ?? null);
  const lastShowingFocusRef = useRef<string | null>(null);
  const [loadedScheduleKey, setLoadedScheduleKey] = useState("");
  const [futureOnly, setFutureOnly] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [view, setView] = useState<AppView>(initialHashState.view);
  const scheduleRequestKey = `${view}:${selectedDate}:${showAllMovieDates}`;
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [showJumpToNow, setShowJumpToNow] = useState(false);
  const [activeScheduleTimePeriod, setActiveScheduleTimePeriod] =
    useState<ScheduleTimePeriod | null>(null);
  const [cinemaTravelModes, setCinemaTravelModes] = useState<
    Map<string, TravelMode>
  >(() => new Map());
  const [cinemaCustomDurations, setCinemaCustomDurations] = useState<
    Map<string, number | null>
  >(() => new Map());
  const [cinemaScheduleVisibility, setCinemaScheduleVisibility] = useState<
    Map<string, boolean>
  >(() => new Map());
  const [cinemaDurationDrafts, setCinemaDurationDrafts] = useState<
    Map<string, string>
  >(() => new Map());
  const [cinemaNotes, setCinemaNotes] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [cinemaNoteDrafts, setCinemaNoteDrafts] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [savingCinemaIds, setSavingCinemaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [cinemaPreferenceError, setCinemaPreferenceError] = useState<
    string | null
  >(null);
  const [movieNotes, setMovieNotes] = useState<Map<string,string>>(new Map());
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
  const [preferenceDialogMode, setPreferenceDialogMode] = useState<"note" | "settings">("settings");
  const [activeMoviePreference, setActiveMoviePreference] =
    useState<MoviePreferenceTarget | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    departureRegistered: false,
    departureUpdatedAt: null,
    scheduleCollapseMinutes: 60,
  });
  const [profileState, setProfileState] = useState<
    "idle" | "deleting"
  >("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [collapsePreferenceState, setCollapsePreferenceState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [viewingPlans, setViewingPlans] = useState<ViewingPlan[]>([]);
  const [viewingPlansRevision, setViewingPlansRevision] = useState(0);
  const [viewingPlansState, setViewingPlansState] = useState<
    "loading" | "idle" | "error"
  >("loading");
  const [viewingPlanError, setViewingPlanError] = useState<string | null>(null);
  const [savingViewingPlanIds, setSavingViewingPlanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedMovieListDate =
    view === "movies" && showAllMovieDates ? null : selectedDate;
  const historyScroll = useHistoryScroll(
    hashForAppView(view, { date: view === "movies" ? selectedMovieListDate : ["schedule", "movie", "collectionStatus", "adminCollection"].includes(view) ? selectedDate : null,
      user: selectedMemberId, movie: selectedMovieKey, showing: selectedShowingId, query: normalizedSearchQuery }),
    !loading && loadedScheduleKey === scheduleRequestKey && interactiveSearchQuery === normalizedSearchQuery,
  );

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
    if (historyScroll.pending.current || historyScroll.handledHash.current === window.location.hash) return;

    const scrollTarget = getAppPageScrollTarget(
      view,
      selectedDate,
      today,
      selectedMovieKey,
    );

    pendingHomeScrollRef.current = false;
    didInitialTimeScrollRef.current = false;

    if (scrollTarget === "linked-movie" || selectedShowingId) {
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
  }, [cinemaCustomDurations]);

  useEffect(() => {
    const updateClock = () => { if (document.visibilityState === "visible") setNow(new Date()); };
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
        nextView === "schedule" ||
        nextView === "movies" ||
        nextView === "movie" ||
        nextView === "collectionStatus" || nextView === "adminCollection";
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
        showing: nextView === "schedule" ? hashState.showing : null,
        user: nextView === "member" ? hashState.user : null,
      });
      if (window.location.hash !== canonicalHash) {
        window.history.replaceState(window.history.state, "", canonicalHash);
        historyScroll.syncEntryURL();
      }
      setView(nextView);
      setSelectedMemberId(nextView === "member" ? hashState.user ?? "" : "");
      // Date-less destinations (shared interests, plans, etc.) do not reset
      // the day used by the floating schedule navigator.
      setSelectedDate((previous) =>
        usesWeeklyDate ? nextScheduleDate : dates.includes(previous) ? previous : dates[0],
      );
      setShowAllMovieDates(nextShowAllMovieDates);
      setSearchDraft(usesWeeklyDate ? hashState.query : "");
      setAreaSearchOpen(false);
      if (hashState.query) setSelectedArea("all");
      setPlannerDate(nextPlannerDate);
      setSelectedMovieKey(nextMovieKey);
      setSelectedShowingId(nextView === "schedule" ? hashState.showing ?? null : null);
      lastShowingFocusRef.current = null;
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
    };
  }, [dates, plannerMaxDate, today]);

  useEffect(() => {
    const strip = dateStripRef.current;
    const active = strip?.querySelector<HTMLElement>("[aria-current]");
    if (!strip || !active || historyScroll.pending.current || historyScroll.handledHash.current === window.location.hash) return;
    const bounds = strip.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    if (target.left < bounds.left || target.right > bounds.right) {
      strip.scrollTo({
        left: strip.scrollLeft + target.left - bounds.left - (bounds.width - target.width) / 2,
        behavior: "instant",
      });
    }
  }, [view, selectedDate, showAllMovieDates]);

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
        if (controller.signal.aborted) return;
        setLoadedScheduleKey(scheduleRequestKey);
        registerTitleTranslations(data.movieTitles ?? []);
        setSchedule(data);
        setSelectedArea((current) =>
          getAvailableAreaOptions(data.cinemas).some((area) => area.id === current)
            ? current
            : "all",
        );
        setMovieNotes(new Map(data.preferences.map(p => [p.movieKey,p.comment ?? ""])));
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
              .map((preference) => [preference.movieKey, preference.status]),
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
        setCinemaScheduleVisibility(
          new Map(
            data.cinemaTravelPreferences.map((preference) => [
              preference.cinemaId,
              preference.showInSchedule,
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
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
        if (controller.signal.aborted) return;
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
  }, [viewingPlansRevision]);

  useEffect(() => {
    if (selectedDate !== dates[0]) setFutureOnly(false);
  }, [dates, selectedDate]);

  const routeByCinema = useMemo(
    // Manual minutes support personal timing without collecting coordinates.
    () => new Map([...cinemaCustomDurations].flatMap(([cinemaId, durationMinutes]) =>
      durationMinutes === null ? [] : [[cinemaId, { durationMinutes }]],
    )),
    [cinemaCustomDurations],
  );
  const availableAreaOptions = useMemo(
    () => getAvailableAreaOptions(schedule?.cinemas ?? []),
    [schedule?.cinemas],
  );
  const cinemaList = useMemo(
    () =>
      (schedule?.cinemas ?? [])
        .filter(
          (cinema) => selectedArea === "all" || cinema.area === selectedArea,
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
    () => {
      const filtered = new Set(filterShowings(schedule?.showings ?? [], {
        selectedArea,
        futureOnly: futureOnly && selectedDate === dates[0],
        now,
      }).map((showing) => showing.id));
      return (schedule?.showings ?? []).filter((showing) =>
        showing.id === selectedShowingId || (
          filtered.has(showing.id) &&
          (cinemaScheduleVisibility.get(showing.cinemaId) ?? true) &&
          !movieStatusByKey.has(normalizeMovieTitle(showing.title)) &&
          matchesShowingSearchQuery(
            interactiveSearchQuery,
            `${showing.title} ${englishText(showing.title)}`,
            `${showing.cinemaName} ${englishText(showing.cinemaName)}`,
            `${showing.cinemaShortName} ${englishText(showing.cinemaShortName)}`,
          )
        ),
      );
    },
    [
      dates,
      cinemaScheduleVisibility,
      futureOnly,
      interactiveSearchQuery,
      now,
      movieStatusByKey,
      schedule?.showings,
      selectedArea,
      selectedDate,
      selectedShowingId,
    ],
  );
  const timeGroups = useMemo(
    () => groupByScheduleTime(visibleShowings),
    [visibleShowings],
  );
  const scheduleTimeJumpTargets = useMemo(
    () => getScheduleTimeJumpTargets(timeGroups.map((group) => group.time)),
    [timeGroups],
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
          `${showing.title} ${englishText(showing.title)}`,
          `${showing.cinemaName} ${englishText(showing.cinemaName)}`,
          `${showing.cinemaShortName} ${englishText(showing.cinemaShortName)}`,
        ),
    );
    return groupByMovie(areaShowings).sort((movieA, movieB) => {
      const starredDifference =
        Number(starredMovieKeys.has(movieB.preferenceKey)) -
        Number(starredMovieKeys.has(movieA.preferenceKey));
      return (
        starredDifference ||
        movieTitle(movieA.title).localeCompare(
          movieTitle(movieB.title),
          language,
        )
      );
    });
  }, [
    interactiveSearchQuery,
    schedule?.showings,
    selectedArea,
    starredMovieKeys,
    language,
  ]);
  const movieCount = useMemo(
    () =>
      new Set(
        timeGroups.flatMap((group) => group.movies.map((movie) => movie.key)),
      ).size,
    [timeGroups],
  );
  const currentTimeMarkerIndex =
    selectedDate === today ? findCurrentTimeMarkerIndex(timeGroups, now) : -1;
  const showCurrentTimeMarkerAtEnd =
    selectedDate === today &&
    timeGroups.length > 0 &&
    currentTimeMarkerIndex === -1;

  useLayoutEffect(() => {
    if (!selectedShowingId || view !== "schedule" || loading || error || loadedScheduleKey !== scheduleRequestKey ||
      historyScroll.pending.current || historyScroll.handledHash.current === window.location.hash) return;
    const key = window.location.hash;
    if (lastShowingFocusRef.current === key) return;
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-showing-id]"))
      .find((el) => el.dataset.showingId === selectedShowingId);
    if (!target) return;
    const section = target.closest<HTMLDetailsElement>("details.schedule-window");
    if (section) section.open = true;
    target.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
    target.focus({ preventScroll: true });
    lastShowingFocusRef.current = key;
  }, [selectedShowingId, view, loading, error, loadedScheduleKey, scheduleRequestKey, timeGroups]);

  useLayoutEffect(() => {
    if (
      selectedShowingId || historyScroll.pending.current || historyScroll.handledHash.current === window.location.hash ||
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
      selectedShowingId || historyScroll.pending.current || historyScroll.handledHash.current === window.location.hash ||
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

  useEffect(() => {
    if (
      loading ||
      error ||
      !shouldShowScheduleTimeJumps(view, selectedDate, today) ||
      timeGroups.length === 0
    ) {
      setActiveScheduleTimePeriod(null);
      return;
    }

    let animationFrame = 0;
    let scrollTimer = 0;
    const updateActivePeriod = () => {
      window.clearTimeout(scrollTimer);
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const timeline = document.querySelector<HTMLElement>(".timeline");
        const rows = [
          ...document.querySelectorAll<HTMLElement>(
            ".timeline-hour[data-time-period]",
          ),
        ].filter((row) => {
          const scheduleWindow = row.closest<HTMLDetailsElement>(
            "details.schedule-window",
          );
          return (
            row.getClientRects().length > 0 &&
            (!scheduleWindow || scheduleWindow.open)
          );
        });
        if (!timeline || rows.length === 0) {
          setActiveScheduleTimePeriod(null);
          return;
        }

        const styles = getComputedStyle(document.documentElement);
        const stickyHeight =
          Number.parseFloat(styles.getPropertyValue("--header-height")) +
          Number.parseFloat(styles.getPropertyValue("--date-height")) +
          (window.innerWidth < 720
            ? Number.parseFloat(
                styles.getPropertyValue("--mobile-search-height"),
              )
            : 0);
        const focusY = Math.max(
          stickyHeight + 12,
          stickyHeight + (window.innerHeight - stickyHeight) * 0.42,
        );
        const timelineRect = timeline.getBoundingClientRect();
        if (focusY < timelineRect.top || focusY > timelineRect.bottom) {
          setActiveScheduleTimePeriod(null);
          return;
        }

        const rowAtFocus = rows.find((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top <= focusY && rect.bottom >= focusY;
        });
        const nearestRow =
          rowAtFocus ??
          [...rows]
            .reverse()
            .find((row) => row.getBoundingClientRect().top <= focusY) ??
          rows[0];
        setActiveScheduleTimePeriod(
          nearestRow.dataset.timePeriod as ScheduleTimePeriod,
        );
      });
    };

    // The active-period indicator can wait until scrolling settles. Do not
    // measure every timeline row while the browser is processing a fling.
    const deferActivePeriod = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(updateActivePeriod, 150);
    };
    const onScrollEnd = (event: Event) => {
      if (event.target === document) updateActivePeriod();
    };
    updateActivePeriod();
    window.addEventListener("scroll", deferActivePeriod, { passive: true });
    document.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("resize", updateActivePeriod);
    document.addEventListener("toggle", updateActivePeriod, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", deferActivePeriod);
      document.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", updateActivePeriod);
      document.removeEventListener("toggle", updateActivePeriod, true);
    };
  }, [error, loading, selectedDate, timeGroups.length, today, view]);

  const deleteDepartureProfile = async () => {
    if (!window.confirm(localize("登録したベース出発地点を削除しますか？")))
      return;

    setProfileState("deleting");
    setProfileError(null);
    try {
      const response = await fetch("/api/profile", { method: "DELETE" });
      if (!response.ok) throw new Error();
      const profile = (await response.json()) as UserProfile;
      setUserProfile((current) => ({ ...current, ...profile }));
      setSchedule((current) =>
        current ? { ...current, userProfile: { ...current.userProfile, ...profile } } : current,
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
    rememberCinemaAnchor(anchor);
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
          customDurationMinutes: cinemaCustomDurations.get(cinemaId) ?? null,
        }),
      });
      if (!response.ok) throw new Error();
      const preference = (await response.json()) as CinemaTravelPreference;
      setCinemaTravelModes((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.travelMode);
        return next;
      });
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

  const saveCinemaScheduleVisibility = async (
    cinemaId: string,
    showInSchedule: boolean,
  ) => {
    if (savingCinemaIds.has(cinemaId)) return;
    const previous = cinemaScheduleVisibility.get(cinemaId) ?? true;
    setCinemaPreferenceError(null);
    setCinemaScheduleVisibility((current) => {
      const next = new Map(current);
      next.set(cinemaId, showInSchedule);
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
        body: JSON.stringify({ cinemaId, showInSchedule }),
      });
      if (!response.ok) throw new Error();
      const preference = (await response.json()) as CinemaTravelPreference;
      setCinemaScheduleVisibility((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.showInSchedule);
        return next;
      });
    } catch {
      setCinemaScheduleVisibility((current) => {
        const next = new Map(current);
        next.set(cinemaId, previous);
        return next;
      });
      setCinemaPreferenceError(
        "上映スケジュールの表示設定を保存できませんでした",
      );
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
    rememberCinemaAnchor(anchor);
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
      const preference = (await response.json()) as CinemaTravelPreference;
      setCinemaCustomDurations((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.customDurationMinutes);
        return next;
      });
      setCinemaDurationDrafts((current) => {
        const next = new Map(current);
        next.set(cinemaId, preference.customDurationMinutes?.toString() ?? "");
        return next;
      });
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
      const preference = (await response.json()) as CinemaTravelPreference;
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
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    window.location.hash = event.currentTarget.hash;
  };

  const submitScheduleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAreaSearchOpen(false);
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
          ...current.filter((plan) => plan.showingId !== savedPlan.showingId),
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

  const updateViewingPlanReservation = async (
    plan: ViewingPlan,
    reserved: boolean,
  ): Promise<void> => {
    setSavingViewingPlanIds((current) => new Set(current).add(plan.showingId));
    setViewingPlanError(null);
    try {
      const response = await fetch(
        `/api/viewing-plans?id=${encodeURIComponent(plan.showingId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ reserved }),
        },
      );
      if (!response.ok) throw new Error();
      setViewingPlans((current) =>
        current.map((item) =>
          item.showingId === plan.showingId
            ? {
                ...item,
                reservedAt: reserved ? new Date().toISOString() : null,
              }
            : item,
        ),
      );
    } catch {
      setViewingPlanError("予約状態を保存できませんでした");
    } finally {
      setSavingViewingPlanIds((current) => {
        const next = new Set(current);
        next.delete(plan.showingId);
        return next;
      });
    }
  };

  const dateSwipeRef = useDateSwipe(
    (view === "schedule" || view === "movies") && !loading,
    `${view}:${selectedDate}:${showAllMovieDates}:${normalizedSearchQuery}`,
    (direction) => {
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
    },
  );

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

  const jumpToScheduleTimePeriod = (period: ScheduleTimePeriod) => {
    const time = scheduleTimeJumpTargets[period];
    if (!time) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (period === "morning") {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
      return;
    }

    const target = document.getElementById(`time-${time.replace(":", "-")}`);
    if (!target) return;
    const collapsedWindow = target.closest<HTMLDetailsElement>(
      "details.schedule-window",
    );
    if (collapsedWindow) collapsedWindow.open = true;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const goHomeToCurrentTime = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    pendingHomeScrollRef.current = true;
    didInitialTimeScrollRef.current = false;
    setSelectedArea("all");
    setFutureOnly(false);
    setSelectedMovieKey(null);
    setSelectedShowingId(null);
    lastShowingFocusRef.current = null;

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
  }, [error, loading, schedule?.date, selectedDate, timeGroups, today, view]);

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

  const toggleMovieStar = async (movie: MoviePreferenceTarget) => {
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
    setSavingMovieKeys((current) => new Set(current).add(movie.preferenceKey));

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
      const saved = await response.json() as {comment?:string};
      setMovieNotes(current => new Map(current).set(movie.preferenceKey,saved.comment ?? ""));
      if (nextStarred && !activeMoviePreference) openMoviePreferenceDialog(movie, null, "note");
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
      const confirmed = window.confirm(localize(MOVIE_HIDE_CONFIRMATION));
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
    setSavingMovieKeys((current) => new Set(current).add(movie.preferenceKey));

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
    mode: "note" | "settings" = "settings",
  ) => {
    setPreferenceError(null);
    setPreferenceDialogMode(mode);
    setActiveMoviePreference({ ...movie, anchorElement });
  };

  const closeMoviePreferenceDialog = () => {
    moviePreferenceDialogRef.current?.close();
  };

  const selectMovieStatusFromDialog = async (status: MoviePreferenceStatus) => {
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
        : fullDateFormatter.format(new Date(`${selectedDate}T12:00:00+09:00`));

  const renderScheduleTimeGroup = (
    group: (typeof timeGroups)[number],
    index: number,
  ) => (
    <Fragment key={group.time}>
      {localize(
        index === currentTimeMarkerIndex && (
          <CurrentTimeMarker markerRef={currentTimeMarkerRef} now={now} />
        ),
      )}
      <section
        className="timeline-hour"
        id={`time-${group.time.replace(":", "-")}`}
        data-time-period={scheduleTimePeriodForTime(group.time)}
        aria-labelledby={`time-label-${group.time.replace(":", "-")}`}
      >
        <div className="hour-label">
          <time
            id={`time-label-${group.time.replace(":", "-")}`}
            dateTime={`${selectedDate}T${group.time}:00+09:00`}
          >
            {localize(group.label)}
          </time>
          <small>{localize(`${group.showingCount}上映`)}</small>
        </div>
        <div className="hour-programs">
          {localize(
            group.movies.map((movie) => {
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
                      <a
                        href={hashForAppView("movie", {
                          date: selectedDate,
                          movie: movie.preferenceKey,
                          query: normalizedSearchQuery,
                        })}
                        onClick={navigateHashLink}
                      >
                        {movieTitle(movie.title)}
                      </a>
                    </h2>
                    {schedule?.preferencesEnabled && (
                      <MovieStarButton compact title={movieTitle(movie.title)} starred={isStarred}
                        saving={savingMovieKeys.has(movie.preferenceKey)}
                        onClick={() => void toggleMovieStar(movie)} />
                    )}
                  </div>
                  <div
                    className="cinema-strip"
                    data-horizontal-scroll={`cinema:${group.time}:${movie.key}`}
                    role="list"
                    aria-label={localize(`${movieTitle(movie.title)}の上映館`)}
                  >
                    {localize(
                      presentation.showings.map(
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
                      ),
                    )}
                  </div>
                </article>
              );
            }),
          )}
        </div>
      </section>
    </Fragment>
  );

  return (
    <>
      <a className="skip-link" href="#main">
        {localize("上映スケジュールへ移動")}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="icon-button menu-button"
            type="button"
            aria-label={localize("メニューを開く")}
            aria-controls="primary-navigation"
            aria-expanded={isNavigationOpen}
            onClick={openNavigation}
          >
            <ListIcon size={21} aria-hidden="true" />
          </button>
          <a
            className="brand"
            href={hashForAppView("schedule", { date: today })}
            aria-label={localize("今日の現在時刻の上映へ戻る")}
            onClick={goHomeToCurrentTime}
          >
            <img
              className="brand-mark"
              src="/brand/hamamubi-icon-v2.svg"
              width="34"
              height="34"
              alt={localize("")}
              aria-hidden="true"
              fetchPriority="high"
            />
            <strong className="brand-wordmark" aria-hidden="true">
              {localize("はまむび！")}
            </strong>
          </a>
          <div className="header-status">
            <button
              className="language-toggle"
              type="button"
              role="switch"
              aria-checked={language === "en"}
              aria-label={localize("英語で表示")}
              title={localize(
                language === "en" ? "日本語に切り替える" : "英語に切り替える",
              )}
              aria-busy={languageSaving}
              disabled={languageSaving}
              onClick={() =>
                void changeLanguage(language === "en" ? "ja" : "en")
              }
            >
              <span data-selected={language === "ja"}>JP</span>
              <span data-selected={language === "en"}>EN</span>
            </button>
            <time dateTime={now.toISOString()}>
              {localize(timeFormatter.format(now))}
            </time>
            <button
              className="icon-button theme-toggle-button"
              type="button"
              aria-label={localize(colorThemeToggleLabel(theme))}
              title={localize(colorThemeToggleLabel(theme))}
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : "dark";
                storeColorTheme(nextTheme);
                setHasExplicitTheme(true);
                setTheme(nextTheme);
              }}
            >
              {localize(
                theme === "dark" ? (
                  <SunIcon size={20} weight="fill" aria-hidden="true" />
                ) : (
                  <MoonIcon size={20} weight="fill" aria-hidden="true" />
                ),
              )}
            </button>
            <ProfileMenu />
          </div>
        </div>
      </header>
      {languageError && <p role="alert">{localize(languageError)}</p>}

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
            <strong id="navigation-title">{localize("メニュー")}</strong>
            <button
              className="icon-button"
              type="button"
              aria-label={localize("メニューを閉じる")}
              onClick={closeNavigation}
            >
              <XIcon size={20} aria-hidden="true" />
            </button>
          </div>
          <nav aria-label={localize("メイン")}>
            <a
              href={hashForAppView("schedule", { date: today })}
              className={view === "schedule" ? "active" : ""}
              aria-current={view === "schedule" ? "page" : undefined}
              onClick={goHomeFromNavigation}
            >
              <CalendarDotsIcon size={20} aria-hidden="true" />
              {localize("上映スケジュール")}
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
              {localize("上映作品")}
            </a>
            <a
              href={hashForAppView("cinemas")}
              className={view === "cinemas" ? "active" : ""}
              aria-current={view === "cinemas" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <BuildingsIcon size={20} aria-hidden="true" />
              {localize("映画館一覧")}
            </a>
            <a
              href={hashForAppView("viewingPlans")}
              className={view === "viewingPlans" ? "active" : ""}
              aria-current={view === "viewingPlans" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <CalendarDotsIcon size={20} aria-hidden="true" />
              {localize("鑑賞予定")}
            </a>
            <a
              href={hashForAppView("shared")}
              className={(view === "shared" || view === "groups") ? "active" : ""}
              aria-current={(view === "shared" || view === "groups") ? "page" : undefined}
              onClick={closeNavigation}
            >
              <UsersThreeIcon size={20} aria-hidden="true" />
              {localize("共有")}
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
              {localize("映画はしごガチャ")}
            </a>
            <a href={hashForAppView("collectionStatus", { date: selectedDate })}
              className={view === "collectionStatus" ? "active" : ""}
              aria-current={view === "collectionStatus" ? "page" : undefined}
              onClick={closeNavigation}>
              <ClockIcon size={20} aria-hidden="true" />
              {language === "en" ? "Schedule updates" : "更新状況"}
            </a>
            <a
              href={hashForAppView("about")}
              className={view === "about" ? "active" : ""}
              aria-current={view === "about" ? "page" : undefined}
              onClick={closeNavigation}
            >
              <InfoIcon size={20} aria-hidden="true" />
              {localize("このサイトについて")}
            </a>
            {userRole === "admin" && (
              <div className="navigation-admin">
                <a href="#admin-collection" onClick={closeNavigation} aria-current={view === "adminCollection" ? "page" : undefined}>{language === "en" ? "Schedule synchronization" : "上映情報の同期"}</a>
                <a
                  href={hashForAppView("adminUsers")}
                  className={view === "adminUsers" ? "active" : ""}
                  aria-current={view === "adminUsers" ? "page" : undefined}
                  onClick={closeNavigation}
                >
                  <UsersThreeIcon size={20} aria-hidden="true" />
                  {localize("管理画面")}
                </a>
              </div>
            )}
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
        {localize(
          activeMoviePreference && (
            <div className="movie-preference-sheet">
              <div className="movie-preference-heading">
                <div>
                  <small>{localize(preferenceDialogMode === "note" ? "気になるに追加しました" : "作品の設定")}</small>
                  <h2 id="movie-preference-title">
                    {movieTitle(activeMoviePreference.title)}
                  </h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={localize(preferenceDialogMode === "note" ? "ひとこと入力を閉じる" : "作品の設定を閉じる")}
                  onClick={closeMoviePreferenceDialog}
                >
                  <XIcon size={20} aria-hidden="true" />
                </button>
              </div>
              {preferenceDialogMode === "settings" && <>
              <a
                className="movie-schedule-link"
                href={hashForAppView("movie", {
                  date: selectedDate,
                  movie: activeMoviePreference.preferenceKey,
                  query: normalizedSearchQuery,
                })}
                onClick={(event) => {
                  closeMoviePreferenceDialog();
                  navigateHashLink(event);
                }}
              >
                <CalendarDotsIcon size={20} aria-hidden="true" />
                {localize("作品の上映スケジュール")}
              </a>
              <div className="movie-external-links" aria-label={localize(`${movieTitle(activeMoviePreference.title)}の作品情報`)}>
                {Object.entries(buildMovieExternalLinks(activeMoviePreference.title)).map(([site, href]) => (
                  <a key={site} href={href} target="_blank" rel="noreferrer">
                    {localize(site === "eiga" ? "映画.com" : "Filmarks")}
                    <ArrowSquareOutIcon size={12} aria-hidden="true" />
                  </a>
                ))}
              </div>
              <div
                className="movie-preference-actions"
                role="group"
                aria-label={localize(
                  `${movieTitle(activeMoviePreference.title)}の状態`,
                )}
              >
                <button
                  type="button"
                  className={
                    starredMovieKeys.has(activeMoviePreference.preferenceKey)
                      ? "favorite active"
                      : "favorite"
                  }
                  aria-pressed={starredMovieKeys.has(
                    activeMoviePreference.preferenceKey,
                  )}
                  disabled={savingMovieKeys.has(
                    activeMoviePreference.preferenceKey,
                  )}
                  onClick={() => void toggleMovieStar(activeMoviePreference)}
                >
                  <StarIcon
                    size={20}
                    weight={
                      starredMovieKeys.has(activeMoviePreference.preferenceKey)
                        ? "fill"
                        : "regular"
                    }
                    aria-hidden="true"
                  />
                  {localize("気になる")}
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
                  onClick={() => void selectMovieStatusFromDialog("watched")}
                >
                  {localize("鑑賞済み")}
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
                  aria-label={localize("上映スケジュールから非表示")}
                  title={localize("上映スケジュールから非表示")}
                >
                  {localize("非表示")}
                </button>
              </div>
              </>}
              {starredMovieKeys.has(activeMoviePreference.preferenceKey) && (
                <WatchlistNote key={activeMoviePreference.preferenceKey} title={activeMoviePreference.title}
                  initialValue={movieNotes.get(activeMoviePreference.preferenceKey) ?? ""}
                  onSaved={comment => {
                    setMovieNotes(current => new Map(current).set(activeMoviePreference.preferenceKey,comment));
                    if (preferenceDialogMode === "note") closeMoviePreferenceDialog();
                  }} />
              )}
              {preferenceDialogMode === "note" && (
                <button className="secondary-button" type="button" onClick={closeMoviePreferenceDialog}>
                  {localize("今は書かずに閉じる")}
                </button>
              )}
              {localize(
                preferenceError && (
                  <p className="inline-status error" role="status">
                    <WarningCircleIcon size={16} aria-hidden="true" />
                    {localize(preferenceError)}
                  </p>
                ),
              )}
            </div>
          ),
        )}
      </dialog>

      <main id="main" ref={dateSwipeRef}>
        {localize(
          (view === "schedule" || view === "movies") && (
            <>
            <nav className="date-nav" aria-label={localize("上映日")}>
              <div ref={dateStripRef} className="date-strip" data-horizontal-scroll="dates">
                {localize(
                  view === "movies" && (
                    <a
                      className={
                        showAllMovieDates ? "day-button active" : "day-button"
                      }
                      href={hashForAppView("movies", {
                        query: normalizedSearchQuery,
                      })}
                      aria-current={showAllMovieDates ? "page" : undefined}
                    >
                      <span>{localize("すべて")}</span>
                      <small>{localize("1週間")}</small>
                    </a>
                  ),
                )}
                {localize(
                  dates.map((date, index) => {
                    const displayDate = dayFormatter.format(
                      new Date(`${date}T12:00:00+09:00`),
                    );
                    const dateValue = new Date(`${date}T12:00:00+09:00`);
                    const monthDay =
                      language === "en"
                        ? localizedDate({
                            month: "short",
                            day: "numeric",
                          }).format(dateValue)
                        : displayDate.split(/[()]/)[0];
                    const weekday = localizedDate({ weekday: "short" }).format(
                      dateValue,
                    );
                    return (
                      <a
                        key={date}
                        className={
                          (view !== "movies" || !showAllMovieDates) && date === selectedDate
                            ? "day-button active"
                            : "day-button"
                        }
                        href={hashForAppView(view, {
                          date,
                          query: normalizedSearchQuery,
                        })}
                        aria-current={
                          (view !== "movies" || !showAllMovieDates) && date === selectedDate
                            ? "date"
                            : undefined
                        }
                      >
                        <span>{localize(index === 0 ? "今日" : monthDay)}</span>
                        <small>{localize(weekday)}{userRole === "admin" && <span
                          className="collection-count"
                          data-needs-check={(collectionCounts?.[date] ?? 0) > 0}
                          title={language === "en" ? "Cinemas needing a check: failed, unchecked or stale" : "要確認の映画館数：取得エラー・未確認・更新が古い"}
                          aria-label={collectionCounts?.[date] === undefined
                            ? (language === "en" ? "Collection status unavailable" : "取得状況を確認できません")
                            : (language === "en" ? `${collectionCounts[date]} cinemas need checking` : `要確認の映画館 ${collectionCounts[date]}館`)}
                        >{collectionCounts?.[date] ?? "—"}</span>}</small>
                      </a>
                    );
                  }),
                )}
              </div>
            </nav>
              {userRole === "admin" && <a className="collection-count-key" href={hashForAppView("adminCollection", { date: selectedDate })}>
                {language === "en" ? "Circled numbers: cinemas needing a check" : "丸数字：要確認の映画館数"}
              </a>}
            </>
          ),
        )}

        {localize(
          (view === "schedule" || view === "movies") && (
            <search className="schedule-search" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAreaSearchOpen(false);
            }} onKeyDown={(event) => {
              if (event.key === "Escape") setAreaSearchOpen(false);
            }}>
              <form
                className="schedule-search-form"
                method="get"
                onSubmit={submitScheduleSearch}
              >
                <div className="schedule-search-field">
                  <label htmlFor="schedule-search-query">
                    {localize("作品名・映画館名")}
                  </label>
                  <span className="schedule-search-input">
                    <MagnifyingGlassIcon size={18} aria-hidden="true" />
                    <input
                      id="schedule-search-query"
                      type="search"
                      name="q"
                      value={searchDraft}
                      placeholder={selectedArea === "all"
                        ? localize("例：スパイダーマン、TOHOシネマズ")
                        : localize(AREA_OPTIONS.find(area => area.id === selectedArea)!.label)}
                      aria-expanded={areaSearchOpen && !normalizedSearchQuery}
                      aria-controls="schedule-area-options"
                      onFocus={() => setAreaSearchOpen(true)}
                      onClick={() => setAreaSearchOpen(true)}
                      autoComplete="off"
                      enterKeyHint="search"
                      onChange={(event) => {
                        setSearchDraft(event.target.value);
                        if (normalizeSearchQuery(event.target.value)) {
                          setSelectedArea("all");
                          setAreaSearchOpen(false);
                        } else setAreaSearchOpen(true);
                      }}
                    />
                    {localize(
                      (normalizedSearchQuery || selectedArea !== "all") && (
                        <button
                          className="schedule-search-clear"
                          type="button"
                          aria-label={localize("検索条件を解除")}
                          onClick={() => { clearScheduleSearch(); setSelectedArea("all"); setAreaSearchOpen(false); }}
                        >
                          <XIcon size={17} aria-hidden="true" />
                        </button>
                      ),
                    )}
                  </span>
                </div>
                <button className="schedule-search-submit" type="submit">
                  {localize("検索")}
                </button>
              </form>
              {areaSearchOpen && !normalizedSearchQuery && (
                <div className="search-area-panel">
                  <p>{language === "en" ? "Find by area" : "地域で探す"}</p>
                  <div
                    className="search-area-choices"
                    id="schedule-area-options"
                    role="group"
                    aria-label={localize("エリア")}
                  >
                    {localize(
                      availableAreaOptions.map((area) => (
                        <button
                          key={area.id}
                          type="button"
                          className={
                            selectedArea === area.id
                              ? "filter-chip active"
                              : "filter-chip"
                          }
                          aria-pressed={selectedArea === area.id}
                          onClick={() => { setSelectedArea(area.id); setAreaSearchOpen(false); }}
                        >
                          {localize(area.label)}
                        </button>
                      )),
                    )}
                  </div>
                </div>
              )}
              {localize(
                interactiveSearchQuery && (
                  <p className="schedule-search-result" role="status">
                    {localize("「")}
                    {localize(interactiveSearchQuery)}
                    {localize("」で絞り込み中")}
                  </p>
                ),
              )}
            </search>
          ),
        )}

        {localize(
          (view === "schedule" || view === "movies" || view === "cinemas") && (
            <section
              className="schedule-controls"
              aria-label={localize("上映の絞り込み")}
            >
              {view === "cinemas" && (
              <div
                className="area-strip"
                data-horizontal-scroll="areas"
                role="group"
                aria-label={localize("エリア")}
              >
                {localize(
                  availableAreaOptions.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      className={
                        selectedArea === area.id
                          ? "filter-chip active"
                          : "filter-chip"
                      }
                      aria-pressed={selectedArea === area.id}
                      onClick={() => setSelectedArea(area.id)}
                    >
                      {localize(area.label)}
                    </button>
                  )),
                )}
              </div>
              )}

              {view === "schedule" && selectedDate === dates[0] && (
                <div className="control-row">
                  <div
                    className="time-filter"
                    role="group"
                    aria-label={localize("時間")}
                  >
                    <button
                      type="button"
                      aria-pressed={futureOnly}
                      className={futureOnly ? "active" : ""}
                      onClick={() => setFutureOnly(true)}
                    >
                      {localize("これから")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={!futureOnly}
                      className={!futureOnly ? "active" : ""}
                      onClick={() => setFutureOnly(false)}
                    >
                      {localize("全時間")}
                    </button>
                  </div>
                </div>
              )}

              {localize(
                cinemaPreferenceError && (
                  <p className="inline-status error" role="status">
                    <WarningCircleIcon size={16} aria-hidden="true" />
                    {localize(cinemaPreferenceError)}
                  </p>
                ),
              )}
              {localize(
                preferenceError && (
                  <p className="inline-status error" role="status">
                    <WarningCircleIcon size={16} aria-hidden="true" />
                    {localize(preferenceError)}
                  </p>
                ),
              )}
            </section>
          ),
        )}

        {localize(
          view === "movie" ? (
            <>
            {preferenceError && <p className="inline-status error" role="alert">{localize(preferenceError)}</p>}
            <MoviePage movieKey={selectedMovieKey} today={today}
              renderActions={movie => schedule?.preferencesEnabled ? (
                <MovieActions className="movie-detail-actions" title={movieTitle(movie.title)}
                  status={movieStatusByKey.get(movie.preferenceKey) ?? null}
                  starred={starredMovieKeys.has(movie.preferenceKey)} saving={savingMovieKeys.has(movie.preferenceKey)}
                  onMore={() => openMoviePreferenceDialog(movie, null)}
                  onStatus={status => void updateMovieStatus(movie, status, null)}
                  onStar={() => void toggleMovieStar(movie)} />
              ) : null} />
            </>
          ) : view === "adminCollection" ? (
            <AdminCollectionPage language={language} date={selectedDate} />
          ) : view === "adminUsers" ? (
            <AdminUsersPage />
          ) : view === "member" ? (
            <MemberPage key={selectedMemberId} userId={selectedMemberId} />
          ) : view === "account" ? (
            <AccountPage
              scheduleSettings={
                <section
                  className="account-section account-cinema-settings"
                  aria-labelledby="schedule-cinemas-heading"
                >
                  <h2 id="schedule-cinemas-heading">
                    {localize("スケジュールに表示する映画館")}
                  </h2>
                  <p className="account-muted">
                    {localize(
                      "選んだ映画館の上映予定をまとめて表示します。変更は自動で保存されます。",
                    )}
                  </p>
                  {loading ? (
                    <p role="status">{localize("読み込み中…")}</p>
                  ) : error ? (
                    <p role="alert" className="account-message error">
                      {localize(error)}
                    </p>
                  ) : (
                    <>
                      {!schedule?.cinemaTravelPreferencesEnabled && (
                        <p>
                          {localize(
                            "映画館の表示設定を変更するにはログインしてください。",
                          )}
                        </p>
                      )}
                      <div className="account-cinema-list">
                        {(schedule?.cinemas ?? []).map((cinema) => (
                          <label
                            key={cinema.id}
                            className="cinema-schedule-toggle"
                          >
                            <span>
                              <strong>{localize(cinema.name)}</strong>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              checked={
                                cinemaScheduleVisibility.get(cinema.id) ?? true
                              }
                              disabled={
                                savingCinemaIds.has(cinema.id) ||
                                !schedule?.cinemaTravelPreferencesEnabled
                              }
                              onChange={(event) =>
                                void saveCinemaScheduleVisibility(
                                  cinema.id,
                                  event.currentTarget.checked,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <p role="status" className="account-muted">
                        {savingCinemaIds.size > 0 ? localize("保存中…") : ""}
                      </p>
                      {cinemaPreferenceError && (
                        <p role="alert" className="account-message error">
                          {localize(cinemaPreferenceError)}
                        </p>
                      )}
                      <a
                        href={hashForAppView("schedule", {
                          date: selectedDate,
                        })}
                      >
                        {localize("上映スケジュールを見る")}
                      </a>
                    </>
                  )}
                </section>
              }
              profileSettings={
                !loading && !error ? (
                  <ProfilePanel
                    enabled={Boolean(schedule?.userProfileEnabled)}
                    profile={userProfile}
                    state={profileState}
                    collapseState={collapsePreferenceState}
                    error={profileError}
                    onDelete={() => void deleteDepartureProfile()}
                    onCollapseChange={(value) =>
                      void saveScheduleCollapsePreference(value)
                    }
                  />
                ) : null
              }
            />
          ) : view === "collectionStatus" ? (
            <CollectionStatusPage date={selectedDate} language={language} />
          ) : view === "notifications" ? (
            <NotificationsPage />
          ) : (view === "shared" || view === "groups") ? (
            <SharedPage manage={view === "groups"} onPlansChanged={() => setViewingPlansRevision(v => v + 1)} />
          ) : view === "viewingPlans" ? (
            <ViewingPlansPage
              plans={viewingPlans}
              starredMovieKeys={starredMovieKeys}
              loading={viewingPlansState === "loading"}
              error={viewingPlanError}
              savingIds={savingViewingPlanIds}
              onRemove={removeViewingPlan}
              onReservationChange={updateViewingPlanReservation}
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
                eyebrow={localize(
                  view === "cinemas" ? "対象エリア" : selectedDateLabel,
                )}
                title={localize(
                  view === "schedule"
                    ? "上映スケジュール"
                    : view === "movies"
                      ? "上映中の作品"
                      : "映画館",
                )}
                meta={
                  !loading &&
                  !error && (
                    <span className="page-count">
                      {localize(
                        view === "schedule"
                          ? `${movieCount}作品`
                          : view === "movies"
                            ? `${movieList.length}作品`
                            : `${cinemaList.length}館`,
                      )}
                      {localize(
                        view === "schedule" && (
                          <small>
                            {localize(`${visibleShowings.length}上映`)}
                          </small>
                        ),
                      )}
                    </span>
                  )
                }
              />

              {!loading && view === "movies" && (
                <a className="collection-status-link" href={hashForAppView("collectionStatus", { date: selectedDate })}>
                  <ClockIcon size={18} aria-hidden="true" />
                  {language === "en" ? "Check schedule updates" : "更新状況を見る"}
                </a>
              )}

              {localize(loading && view === "schedule" && <LoadingTimeline />)}
              {localize(
                !loading && error && (
                  <div className="state-card error-state" role="alert">
                    <WarningCircleIcon size={25} aria-hidden="true" />
                    <div>
                      <strong>{localize("読み込みに失敗しました")}</strong>
                      <p>{localize(error)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                    >
                      {localize("再読み込み")}
                    </button>
                  </div>
                ),
              )}
              {localize(
                !loading &&
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
                          {localize(
                            view === "schedule"
                              ? "条件に合う上映がありません"
                              : view === "movies"
                                ? "上映中の作品がありません"
                                : "対象の映画館がありません",
                          )}
                        </strong>
                        <p>
                          {localize(
                            interactiveSearchQuery &&
                              (view === "schedule" || view === "movies")
                              ? "作品名や映画館名を変えて検索してください。"
                              : view === "cinemas"
                                ? "エリアを広げてください。"
                                : "エリアを広げるか、別の日を選んでください。",
                          )}
                        </p>
                      </div>
                    </div>
                  ),
              )}
              {localize(
                !loading &&
                  !error &&
                  view === "movies" &&
                  movieList.length > 0 && (
                    <>
                      <ul className="movie-list">
                        {localize(
                          movieList.map((movie, index) => {
                            const movieHref = hashForAppView("movie", {
                              date: selectedMovieListDate,
                              movie: movie.preferenceKey,
                              query: normalizedSearchQuery,
                            });
                            const isStarred = starredMovieKeys.has(
                              movie.preferenceKey,
                            );
                            const status =
                              movieStatusByKey.get(movie.preferenceKey) ?? null;
                            const releaseDateLabel = movie.releaseDate
                              ? dayFormatter.format(
                                  new Date(
                                    `${movie.releaseDate}T12:00:00+09:00`,
                                  ),
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
                                  selectedMovieKey === movie.preferenceKey
                                    ? "linked"
                                    : "",
                                  schedule?.preferencesEnabled
                                    ? ""
                                    : "preferences-disabled",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                data-date-swipe-card
                                data-movie-key={movie.preferenceKey}
                                key={movie.preferenceKey}
                              >
                                <a
                                  className="movie-image-link"
                                  href={movieHref}
                                  onClick={navigateHashLink}
                                  aria-label={movieTitle(movie.title)}
                                >
                                  {localize(
                                    movie.imageUrl ? (
                                      <img
                                        src={movie.imageUrl}
                                        alt={localize("")}
                                        width="104"
                                        height="66"
                                        loading={index < 3 ? "eager" : "lazy"}
                                        decoding="async"
                                      />
                                    ) : (
                                      <div
                                        className="movie-image-placeholder"
                                        aria-hidden="true"
                                      >
                                        {movieTitle(movie.title).slice(0, 1)}
                                      </div>
                                    ),
                                  )}
                                </a>
                                <div className="movie-list-copy">
                                  <strong>
                                    <a
                                      href={movieHref}
                                      onClick={navigateHashLink}
                                      aria-current={
                                        selectedMovieKey === movie.preferenceKey
                                          ? "location"
                                          : undefined
                                      }
                                    >
                                      {movieTitle(movie.title)}
                                    </a>
                                  </strong>
                                  {localize(
                                    movie.releaseDate && releaseDateLabel && (
                                      <p
                                        className="movie-release-date"
                                        aria-label={localize(
                                          `${movieTitle(movie.title)}の日本公開日`,
                                        )}
                                      >
                                        <CalendarDotsIcon
                                          size={13}
                                          aria-hidden="true"
                                        />
                                        <time dateTime={movie.releaseDate}>
                                          {localize(
                                            `日本公開 ${releaseDateLabel}`,
                                          )}
                                        </time>
                                      </p>
                                    ),
                                  )}
                                  {localize(
                                    showAllMovieDates && (
                                      <p
                                        className="movie-showing-dates"
                                        aria-label={localize(
                                          `${movieTitle(movie.title)}の上映日`,
                                        )}
                                      >
                                        <CalendarDotsIcon
                                          size={13}
                                          aria-hidden="true"
                                        />
                                        {localize(showingDateLabels.join("・"))}
                                      </p>
                                    ),
                                  )}
                                  {showAllMovieDates && <ScreeningFormat format={movie.showings.map(showing => showing.format).filter(Boolean).join(" / ")} language={language} />}
                                  {schedule?.preferencesEnabled && (
                                    <MovieActions className="movie-card-actions" title={movieTitle(movie.title)}
                                      status={status} starred={isStarred} saving={savingMovieKeys.has(movie.preferenceKey)}
                                      onMore={event => openMoviePreferenceDialog(movie, event.currentTarget.closest<HTMLElement>(".movie-list-item"))}
                                      onStatus={(status, button) => void updateMovieStatus(movie, status, button.closest<HTMLElement>(".movie-list-item"))}
                                      onStar={() => void toggleMovieStar(movie)} />
                                  )}
                                </div>
                                {!showAllMovieDates && <MovieTimes showings={movie.showings} language={language} title={movieTitle(movie.title)} />}
                              </li>
                            );
                          }),
                        )}
                      </ul>
                    </>
                  ),
              )}
              {localize(
                !loading &&
                  !error &&
                  view === "cinemas" &&
                  cinemaList.length > 0 && (
                    <ul className="cinema-list">
                      {localize(
                        cinemaList.map((cinema) => {
                          const travelMode =
                            cinemaTravelModes.get(cinema.id) ?? "transit";
                          const customDuration =
                            cinemaCustomDurations.get(cinema.id) ?? null;
                          const durationDraft =
                            cinemaDurationDrafts.get(cinema.id) ?? "";
                          const savedNote = cinemaNotes.get(cinema.id) ?? "";
                          const noteDraft =
                            cinemaNoteDrafts.get(cinema.id) ?? "";
                          const isSaving = savingCinemaIds.has(cinema.id);
                          const showInSchedule =
                            cinemaScheduleVisibility.get(cinema.id) ?? true;
                          return (
                            <li className="cinema-list-item" key={cinema.id}>
                              <div className="cinema-list-heading">
                                <h2>
                                  {localize(cinema.name)}
                                  {localize(
                                    cinema.activeUntil && (
                                      <span className="cinema-closure-date">
                                        {localize("（")}
                                        {localize(
                                          closureDateFormatter.format(
                                            new Date(
                                              `${cinema.activeUntil}T12:00:00+09:00`,
                                            ),
                                          ),
                                        )}
                                        {localize("閉館予定）")}
                                      </span>
                                    ),
                                  )}
                                </h2>
                                <p>
                                  <MapPinIcon size={15} aria-hidden="true" />
                                  {localize(cinema.areaLabel)}
                                </p>
                              </div>
                              <label className="cinema-schedule-toggle">
                                <span>
                                  <strong>
                                    {localize("上映スケジュールに表示")}
                                  </strong>
                                </span>
                                <input
                                  type="checkbox"
                                  role="switch"
                                  checked={showInSchedule}
                                  disabled={
                                    isSaving ||
                                    !schedule?.cinemaTravelPreferencesEnabled
                                  }
                                  onChange={(event) =>
                                    void saveCinemaScheduleVisibility(
                                      cinema.id,
                                      event.currentTarget.checked,
                                    )
                                  }
                                />
                              </label>
                              <CinemaExteriorThumbnail cinema={cinema} />
                              <p className="cinema-address">
                                {localize(cinema.address)}
                              </p>
                              <div className="cinema-preference-row">
                                <label htmlFor={`travel-mode-${cinema.id}`}>
                                  {localize("移動方法")}
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
                                  {localize(
                                    TRAVEL_MODE_OPTIONS.map((option) => (
                                      <option
                                        value={option.value}
                                        key={option.value}
                                      >
                                        {localize(option.label)}
                                      </option>
                                    )),
                                  )}
                                </select>
                                <span aria-live="polite">
                                  {isSaving ? localize("保存中") : null}
                                </span>
                              </div>
                              <div className="cinema-duration-row">
                                <label htmlFor={`custom-duration-${cinema.id}`}>
                                  {localize("自分の所要時間")}
                                </label>
                                <div className="duration-input">
                                  <input
                                    id={`custom-duration-${cinema.id}`}
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    max="1440"
                                    step="1"
                                    placeholder="30"
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
                                  <span>{localize("分")}</span>
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
                                  {localize("保存")}
                                </button>
                                {localize(
                                  customDuration !== null && (
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
                                      {localize("クリア")}
                                    </button>
                                  ),
                                )}
                              </div>
                              <div className="cinema-note-row">
                                <label htmlFor={`cinema-note-${cinema.id}`}>
                                  {localize("館内・座席メモ")}
                                </label>
                                <textarea
                                  id={`cinema-note-${cinema.id}`}
                                  rows={3}
                                  maxLength={2000}
                                  placeholder={localize(
                                    "例：シアター3は中央のG〜I列が見やすい",
                                  )}
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
                                  <small>
                                    {localize(noteDraft.length)}
                                    {localize("/2000")}
                                  </small>
                                  <button
                                    type="button"
                                    disabled={
                                      isSaving || noteDraft.trim() === savedNote
                                    }
                                    onClick={(event) =>
                                      void saveCinemaNote(
                                        cinema.id,
                                        event.currentTarget.closest<HTMLElement>(
                                          ".cinema-list-item",
                                        ),
                                      )
                                    }
                                  >
                                    {localize(
                                      isSaving ? "保存中" : "メモを保存",
                                    )}
                                  </button>
                                </div>
                              </div>
                              <a
                                className="cinema-official-link"
                                href={cinema.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {localize("公式サイト")}
                                <ArrowSquareOutIcon
                                  size={16}
                                  aria-hidden="true"
                                />
                              </a>
                            </li>
                          );
                        }),
                      )}
                    </ul>
                  ),
              )}
              {localize(
                !loading &&
                  !error &&
                  view === "schedule" &&
                  timeGroups.length > 0 && (
                    <div className="timeline">
                      {localize(
                        userProfile.scheduleCollapseMinutes === 0
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
                                  id={`schedule-window-${bucket.key}`}
                                  key={`${selectedDate}-${userProfile.scheduleCollapseMinutes}-${bucket.key}`}
                                  open={defaultOpen || undefined}
                                >
                                  <summary>
                                    <span>{localize(bucket.label)}</span>
                                    <small>
                                      {localize(`${bucket.movieCount}作品`)} /{" "}
                                      {localize(`${bucket.showingCount}上映`)}
                                    </small>
                                  </summary>
                                  <div className="schedule-window-content">
                                    {localize(
                                      bucket.groups.map((group) =>
                                        renderScheduleTimeGroup(
                                          group,
                                          timeGroups.indexOf(group),
                                        ),
                                      ),
                                    )}
                                  </div>
                                </details>
                              );
                            }),
                      )}
                      {localize(
                        showCurrentTimeMarkerAtEnd && (
                          <CurrentTimeMarker
                            markerRef={currentTimeMarkerRef}
                            now={now}
                          />
                        ),
                      )}
                    </div>
                  ),
              )}
            </PageShell>
          ),
        )}
      </main>

      {(view === "schedule" || view === "movies" || view === "shared" || view === "viewingPlans") && (
        <ScheduleNavigator
          view={view}
          dates={dates}
          selectedDate={selectedMovieListDate}
          query={normalizedSearchQuery}

        />
      )}

      {localize(
        showJumpToNow && (
          <button
            type="button"
            className={`jump-to-now-button${
              view === "schedule" ? " with-location-button" : ""
            }`}
            aria-label={localize("現在時刻の上映位置へ移動")}
            onClick={jumpToCurrentTime}
          >
            <ClockIcon size={18} weight="bold" aria-hidden="true" />
            {localize("今の上映へ")}
          </button>
        ),
      )}

      {localize(
        !loading &&
          !error &&
          timeGroups.length > 0 &&
          shouldShowScheduleTimeJumps(view, selectedDate, today) && (
            <nav
              className="schedule-time-jumps"
              aria-label={localize("時間帯へ移動")}
            >
              {localize(
                SCHEDULE_TIME_PERIODS.map((period) => {
                  const Icon =
                    period.id === "morning"
                      ? SunHorizonIcon
                      : period.id === "daytime"
                        ? SunIcon
                        : period.id === "evening"
                          ? SunDimIcon
                          : MoonStarsIcon;
                  const isActive = activeScheduleTimePeriod === period.id;
                  const hasTarget = scheduleTimeJumpTargets[period.id] !== null;
                  return (
                    <button
                      type="button"
                      className={isActive ? "active" : undefined}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={localize(`${period.label}の上映へ移動`)}
                      title={localize(
                        hasTarget
                          ? isActive
                            ? `${period.label}の時間帯を表示中`
                            : `${period.label}の上映へ移動`
                          : `${period.label}の上映はありません`,
                      )}
                      disabled={isActive || !hasTarget}
                      onClick={() => jumpToScheduleTimePeriod(period.id)}
                      key={period.id}
                    >
                      <Icon size={19} weight="bold" aria-hidden="true" />
                      <span>{localize(period.label)}</span>
                    </button>
                  );
                }),
              )}
            </nav>
          ),
      )}
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
      aria-label={localize(`現在時刻 ${timeFormatter.format(now)}`)}
    >
      <time dateTime={now.toISOString()}>
        {localize("現在")}
        {localize(timeFormatter.format(now))}
      </time>
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
      {localize(
        isOpen ? (
          <>
            <iframe
              className="cinema-street-view-frame"
              src={`/api/cinema-exterior/${encodeURIComponent(cinema.id)}`}
              title={localize(`${cinema.name}のGoogle マップ`)}
              loading="lazy"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <button
              type="button"
              className="cinema-street-view-close"
              onClick={() => setIsOpen(false)}
            >
              {localize("閉じる")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cinema-exterior-placeholder"
            onClick={() => setIsOpen(true)}
            aria-label={localize(`${cinema.name}の地図を今すぐ読み込む`)}
          >
            <BuildingsIcon size={28} />
            <strong>{localize("映画館の地図を読み込む")}</strong>
          </button>
        ),
      )}
      <figcaption>{localize("Google マップ")}</figcaption>
    </figure>
  );
}

function ProfilePanel({
  enabled,
  profile,
  state,
  collapseState,
  error,
  onDelete,
  onCollapseChange,
}: {
  enabled: boolean;
  profile: UserProfile;
  state: "idle" | "deleting";
  collapseState: "idle" | "saving" | "saved";
  error: string | null;
  onDelete: () => void;
  onCollapseChange: (value: ScheduleCollapseMinutes) => void;
}) {
  const isBusy = state !== "idle";
  return (
    <>
      <section
        className="profile-panel profile-display-panel"
        aria-labelledby="schedule-display-title"
      >
        <div className="profile-icon" aria-hidden="true">
          <ClockIcon size={27} />
        </div>
        <div className="profile-copy">
          <h2 id="schedule-display-title">
            {localize("上映スケジュール表示")}
          </h2>
        </div>
        <div className="profile-display-setting">
          <label htmlFor="schedule-collapse-minutes">
            {localize("上映時間の折りたたみ")}
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
            <option value={0}>{localize("なし")}</option>
            <option value={30}>{localize("30分")}</option>
            <option value={60}>{localize("1時間")}</option>
          </select>
          <small className="profile-save-status" aria-live="polite">
            {localize(
              collapseState === "saving"
                ? "保存中"
                : collapseState === "saved"
                  ? "保存しました"
                  : null,
            )}
          </small>
        </div>
        {localize(
          !enabled && (
            <p className="inline-status error">
              {localize("公開モードでは利用できません")}
            </p>
          ),
        )}
      </section>

      {profile.departureRegistered && <section
        className="profile-panel profile-location-panel"
        aria-labelledby="departure-profile-title"
      >
        <div className="profile-icon" aria-hidden="true">
          <HouseLineIcon size={27} />
        </div>
        <div className="profile-copy">
          <h2 id="departure-profile-title">
            {localize("ベース出発地点を登録済み")}
          </h2>
          {localize(
            profile.departureUpdatedAt && (
              <small>
                {localize(
                  updatedFormatter.format(new Date(profile.departureUpdatedAt)),
                )}
                {localize("登録")}
              </small>
            ),
          )}
        </div>
        {localize(
          profile.departureRegistered && (
            <button
              type="button"
              className="profile-delete-action"
              disabled={!enabled || isBusy}
              onClick={onDelete}
            >
              <TrashIcon size={15} aria-hidden="true" />
              {localize(
                state === "deleting" ? "削除中" : "ベース出発地点を削除",
              )}
            </button>
          ),
        )}
        {localize(
          !enabled && (
            <p className="inline-status error">
              {localize("公開モードでは利用できません")}
            </p>
          ),
        )}
      </section>}
      {error && <p className="inline-status error" role="status">
        <WarningCircleIcon size={16} aria-hidden="true" />{localize(error)}
      </p>}
    </>
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
  const metadata = [showing.screen, splitScreeningFormat(showing.format).detail]
    .filter((value): value is string => Boolean(value))
    .map(screeningInfo)
    .join(" / ");
  const reachableLabel = isReachable
    ? travelMinutes === null
      ? "間に合う"
      : formatReachableLabel(travelMinutes)
    : null;
  const unreachableLabel = isUnreachable
    ? travelMinutes === null
      ? "間に合わない"
      : formatUnreachableLabel(travelMinutes)
    : null;
  const viewingPlanButtonState = getViewingPlanButtonState(isPast, isSaving);

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
      data-date-swipe-card
      data-showing-id={showing.id}
      tabIndex={-1}
    >
      <div className="cinema-slot-info">
        <div className="slot-time">
          <strong>{localize(start)}</strong>
          <span className="slot-time-details">
            {localize(
              end && (
                <span>
                  {localize(end)}
                  {localize("終了")}
                </span>
              ),
            )}
            {localize(
              reachableLabel && (
                <span className="reachable-label">
                  {localize(reachableLabel)}
                </span>
              ),
            )}
            {localize(
              unreachableLabel && (
                <span className="unreachable-label">
                  {localize(unreachableLabel)}
                </span>
              ),
            )}
          </span>
        </div>
        <div className="slot-cinema">
          <strong>{localize(showing.cinemaShortName)}</strong>
        </div>
        <ScreeningFormat format={showing.format} language={localeCode() === "en-GB" ? "en" : "ja"} />
        {localize(
          metadata && <span className="slot-meta">{localize(metadata)}</span>,
        )}
      </div>
      <div className="cinema-slot-actions">
        <a
          className="screening-reserve"
          href={showing.bookingUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${localize("予約サイトへ")} · ${movieTitle(showing.title)} · ${start} · ${localize(showing.cinemaShortName)}${screeningLanguageSuffix(showing.format, localize)}`}
        >
          {localize("予約")}
          <ArrowSquareOutIcon size={16} aria-hidden="true" />
        </a>
      <button
        type="button"
        className={[
          "viewing-plan-toggle",
          viewingPlanButtonState.unavailable ? "unavailable" : "",
          isPlanned ? "planned" : "",
          feedback ? "confirmed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={isPlanned}
        aria-label={localize(
          `${movieTitle(showing.title)} ${start} ${showing.cinemaShortName}を鑑賞予定${isPlanned ? "から外す" : "に追加"}`,
        )}
        disabled={viewingPlanButtonState.disabled}
        onClick={() => void toggle()}
      >
        <img
          src={
            feedback
              ? "/brand/hamamubi-icon-wink.svg"
              : "/brand/hamamubi-icon-v2.svg"
          }
          alt={localize("")}
        />
        <span className="viewing-plan-toggle-label">
          {localize(isSaving ? "保存中" : isPlanned ? "予定済" : "観に行く")}
        </span>
        {localize(
          feedback && (
            <span
              className="viewing-plan-feedback"
              role="status"
              aria-live="polite"
            >
              {localize(
                feedback === "added" ? "チェックしたよ！" : "予定から外したよ",
              )}
            </span>
          ),
        )}
      </button>
      </div>
    </div>
  );
}

function LoadingTimeline() {
  return (
    <div
      className="timeline loading-timeline"
      aria-label={localize("読み込み中")}
    >
      {localize(
        [9, 10, 11].map((hour) => (
          <div className="timeline-hour" key={hour}>
            <div className="hour-label">
              <time>
                {localize(hour)}
                {localize(":00")}
              </time>
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
        )),
      )}
    </div>
  );
}
