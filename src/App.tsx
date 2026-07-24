import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  ClockIcon,
  CrosshairIcon,
  FilmSlateIcon,
  HouseLineIcon,
  ListIcon,
  MapPinIcon,
  SignOutIcon,
  StarIcon,
  TrashIcon,
  UserCircleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { todayInJst } from "../shared/date";
import type {
  Cinema,
  CinemaArea,
  CinemaTravelPreference,
  RouteEstimate,
  RoutesResponse,
  ScheduleResponse,
  Showing,
  TravelMode,
  UserProfile,
} from "../shared/types";
import {
  AREA_OPTIONS,
  buildGoogleMapsDirectionsUrl,
  buildDates,
  filterShowings,
  findCurrentTimeMarkerIndex,
  groupByScheduleTime,
  groupByMovie,
  isShowingPast,
  isShowingReachable,
  scrollToInitialTimeMarker,
} from "./lib";

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

type AppView = "schedule" | "movies" | "cinemas" | "profile";

export function App() {
  const [now, setNow] = useState(() => new Date());
  const currentTimeMarkerRef = useRef<HTMLDivElement>(null);
  const navigationDialogRef = useRef<HTMLDialogElement>(null);
  const pendingMovieAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const pendingCinemaAnchorRef = useRef<{
    element: HTMLElement;
    top: number;
  } | null>(null);
  const didInitialTimeScrollRef = useRef(false);
  const today = todayInJst(now);
  const dates = useMemo(() => buildDates(now), [today]);
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [selectedArea, setSelectedArea] = useState<CinemaArea | "all">("all");
  const [futureOnly, setFutureOnly] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [routes, setRoutes] = useState<RouteEstimate[]>([]);
  const [view, setView] = useState<AppView>("schedule");
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [cinemaTravelModes, setCinemaTravelModes] = useState<
    Map<string, TravelMode>
  >(() => new Map());
  const [cinemaCustomDurations, setCinemaCustomDurations] = useState<
    Map<string, number | null>
  >(() => new Map());
  const [cinemaDurationDrafts, setCinemaDurationDrafts] = useState<
    Map<string, string>
  >(() => new Map());
  const [savingCinemaIds, setSavingCinemaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [cinemaPreferenceError, setCinemaPreferenceError] = useState<
    string | null
  >(null);
  const [routeOrigin, setRouteOrigin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [starredMovieKeys, setStarredMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingMovieKeys, setSavingMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    homeRegistered: false,
    homeUpdatedAt: null,
  });
  const [profileState, setProfileState] = useState<
    "idle" | "saving" | "deleting"
  >("idle");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  useLayoutEffect(() => {
    const pendingAnchor = pendingMovieAnchorRef.current;
    if (!pendingAnchor || !pendingAnchor.element.isConnected) return;
    const nextTop = pendingAnchor.element.getBoundingClientRect().top;
    window.scrollBy(0, nextTop - pendingAnchor.top);
    pendingMovieAnchorRef.current = null;
  }, [starredMovieKeys]);

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
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/showings?date=${selectedDate}`, {
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
  }, [selectedDate]);

  useEffect(() => {
    if (selectedDate !== dates[0]) setFutureOnly(false);
  }, [dates, selectedDate]);

  const routeByCinema = useMemo(
    () => new Map(routes.map((route) => [route.cinemaId, route])),
    [routes],
  );
  const cinemaTravelRows = useMemo(
    () =>
      (schedule?.cinemas ?? [])
        .filter(
          (cinema) =>
            selectedArea === "all" || cinema.area === selectedArea,
        )
        .flatMap((cinema) => {
          const route = routeByCinema.get(cinema.id);
          return route ? [{ cinema, route }] : [];
        })
        .sort(
          (rowA, rowB) =>
            rowA.route.durationMinutes - rowB.route.durationMinutes ||
            rowA.cinema.shortName.localeCompare(rowB.cinema.shortName, "ja"),
        ),
    [routeByCinema, schedule?.cinemas, selectedArea],
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
      }),
    [
      dates,
      futureOnly,
      now,
      schedule?.showings,
      selectedArea,
      selectedDate,
    ],
  );
  const timeGroups = useMemo(
    () => groupByScheduleTime(visibleShowings),
    [visibleShowings],
  );
  const movieList = useMemo(() => {
    const areaShowings = (schedule?.showings ?? []).filter(
      (showing) =>
        selectedArea === "all" || showing.area === selectedArea,
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
  }, [schedule?.showings, selectedArea, starredMovieKeys]);
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
      didInitialTimeScrollRef.current ||
      loading ||
      error ||
      selectedDate !== today ||
      view !== "schedule" ||
      !currentTimeMarkerRef.current
    ) {
      return;
    }

    scrollToInitialTimeMarker(currentTimeMarkerRef.current);
    didInitialTimeScrollRef.current = true;
  }, [error, loading, selectedDate, timeGroups, today, view]);

  const fetchRoutes = useCallback(async () => {
    setRouteState("loading");
    try {
      const response = await fetch("/api/routes", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as RoutesResponse;
      setRoutes(data.routes);
      setRouteOrigin(data.origin);
      setRouteState(data.origin ? "ready" : "idle");
    } catch {
      setRoutes([]);
      setRouteOrigin(null);
      setRouteState("error");
    }
  }, []);

  useEffect(() => {
    if (!userProfile.homeRegistered) {
      setRoutes([]);
      setRouteOrigin(null);
      setRouteState("idle");
      return;
    }
    void fetchRoutes();
  }, [
    fetchRoutes,
    userProfile.homeRegistered,
    userProfile.homeUpdatedAt,
  ]);

  const registerHomeLocation = async () => {
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
        "自宅を登録できませんでした。位置情報の許可を確認してください",
      );
    } finally {
      setProfileState("idle");
    }
  };

  const deleteHomeProfile = async () => {
    if (!window.confirm("登録した自宅位置を削除しますか？")) return;

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
      setProfileError("自宅情報を削除できませんでした");
    } finally {
      setProfileState("idle");
    }
  };

  const saveCinemaTravelMode = async (
    cinemaId: string,
    travelMode: TravelMode,
    anchor: HTMLElement | null,
  ) => {
    if (savingCinemaIds.has(cinemaId)) return;
    if (userProfile.homeRegistered) rememberCinemaAnchor(anchor);
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
      if (userProfile.homeRegistered) await fetchRoutes();
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
    if (userProfile.homeRegistered) rememberCinemaAnchor(anchor);
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
      if (userProfile.homeRegistered) await fetchRoutes();
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

  const navigateTo = (nextView: AppView) => {
    setView(nextView);
    closeNavigation();
  };

  const rememberMovieAnchor = (element: HTMLElement | null) => {
    if (!element) return;
    pendingMovieAnchorRef.current = {
      element,
      top: element.getBoundingClientRect().top,
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
    movie: {
      preferenceKey: string;
      title: string;
      imageUrl: string | null;
    },
    anchorElement: HTMLElement | null,
  ) => {
    if (savingMovieKeys.has(movie.preferenceKey)) return;
    rememberMovieAnchor(anchorElement);
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
      rememberMovieAnchor(anchorElement);
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

  const selectedDateLabel =
    selectedDate === dates[0]
      ? "今日"
      : fullDateFormatter.format(
          new Date(`${selectedDate}T12:00:00+09:00`),
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
          <a className="brand" href="/" aria-label="横浜映画番組表 ホーム">
            <span className="brand-mark" aria-hidden="true">
              Y
            </span>
            <strong>横浜映画</strong>
          </a>
          <div className="header-status">
            <time dateTime={now.toISOString()}>{timeFormatter.format(now)}</time>
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
            <button
              type="button"
              className={view === "schedule" ? "active" : ""}
              aria-current={view === "schedule" ? "page" : undefined}
              onClick={() => navigateTo("schedule")}
            >
              <CalendarDotsIcon size={20} aria-hidden="true" />
              上映時間
            </button>
            <button
              type="button"
              className={view === "movies" ? "active" : ""}
              aria-current={view === "movies" ? "page" : undefined}
              onClick={() => navigateTo("movies")}
            >
              <FilmSlateIcon size={20} aria-hidden="true" />
              上映作品
            </button>
            <button
              type="button"
              className={view === "cinemas" ? "active" : ""}
              aria-current={view === "cinemas" ? "page" : undefined}
              onClick={() => navigateTo("cinemas")}
            >
              <BuildingsIcon size={20} aria-hidden="true" />
              映画館
            </button>
            <button
              type="button"
              className={view === "profile" ? "active" : ""}
              aria-current={view === "profile" ? "page" : undefined}
              onClick={() => navigateTo("profile")}
            >
              <UserCircleIcon size={20} aria-hidden="true" />
              プロフィール
            </button>
          </nav>
        </div>
      </dialog>

      <main id="main">
        {(view === "schedule" || view === "movies") && (
        <nav className="date-nav" aria-label="上映日">
          <div className="date-strip">
            {dates.map((date, index) => {
              const displayDate = dayFormatter.format(
                new Date(`${date}T12:00:00+09:00`),
              );
              const [monthDay, weekday = ""] = displayDate.split(/[()]/);
              return (
                <button
                  key={date}
                  className={
                    date === selectedDate ? "day-button active" : "day-button"
                  }
                  type="button"
                  aria-pressed={date === selectedDate}
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{index === 0 ? "今日" : monthDay}</span>
                  <small>{weekday}</small>
                </button>
              );
            })}
          </div>
        </nav>
        )}

        {view !== "profile" && (
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

          {view !== "movies" && userProfile.homeRegistered && (
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
                ? "自宅からの移動時間を読み込んでいます"
                : routeState === "error"
                  ? "自宅からの移動時間を読み込めませんでした"
                  : "自宅からの固定移動時間を反映しています"}
            </p>
          )}
          {view !== "movies" && !userProfile.homeRegistered && (
            <button
              type="button"
              className="home-profile-link"
              onClick={() => setView("profile")}
            >
              <HouseLineIcon size={16} aria-hidden="true" />
              プロフィールで自宅を登録
            </button>
          )}
          {view === "schedule" &&
            routeState === "ready" &&
            routeOrigin &&
            cinemaTravelRows.length > 0 && (
              <CinemaTravelTimes
                rows={cinemaTravelRows}
                origin={routeOrigin}
              />
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

        <section className="guide" aria-live="polite" aria-busy={loading}>
          <div className="guide-heading">
            <div>
              <p>
                {view === "cinemas"
                  ? "対象エリア"
                  : view === "profile"
                    ? "設定"
                    : selectedDateLabel}
              </p>
              <h1>
                {view === "schedule"
                  ? "上映スケジュール"
                  : view === "movies"
                    ? "上映中の作品"
                    : view === "cinemas"
                      ? "映画館"
                      : "プロフィール"}
              </h1>
            </div>
            {!loading && !error && view !== "profile" && (
              <span>
                {view === "schedule"
                  ? `${movieCount}作品`
                  : view === "movies"
                    ? `${movieList.length}作品`
                    : `${cinemaList.length}館`}
                {view === "schedule" && (
                  <small>{visibleShowings.length}上映</small>
                )}
              </span>
            )}
          </div>

          {schedule?.lastUpdatedAt && !loading && view !== "profile" && (
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
            view !== "profile" &&
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
                    {view === "cinemas"
                      ? "エリアを広げてください。"
                      : "エリアを広げるか、別の日を選んでください。"}
                  </p>
                </div>
              </div>
            )}
          {!loading && !error && view === "profile" && (
            <ProfilePanel
              enabled={Boolean(schedule?.userProfileEnabled)}
              profile={userProfile}
              state={profileState}
              error={profileError}
              onRegister={() => void registerHomeLocation()}
              onDelete={() => void deleteHomeProfile()}
            />
          )}
          {!loading && !error && view === "movies" && movieList.length > 0 && (
            <ul className="movie-list">
              {movieList.map((movie, index) => {
                const isStarred = starredMovieKeys.has(movie.preferenceKey);
                return (
                  <li
                    className={[
                      "movie-list-item",
                      isStarred ? "starred" : "",
                      schedule?.preferencesEnabled
                        ? ""
                        : "preferences-disabled",
                    ]
                      .filter(Boolean)
                      .join(" ")}
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
                    <strong>{movie.title}</strong>
                    {schedule?.preferencesEnabled && (
                      <FavoriteButton
                        title={movie.title}
                        isStarred={isStarred}
                        isSaving={savingMovieKeys.has(movie.preferenceKey)}
                        onClick={(event) =>
                          void toggleMovieStar(
                            movie,
                            event.currentTarget.closest<HTMLElement>(
                              ".movie-list-item",
                            ),
                          )
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
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
                  const isSaving = savingCinemaIds.has(cinema.id);
                  return (
                    <li className="cinema-list-item" key={cinema.id}>
                      <div className="cinema-list-heading">
                        <div>
                          <h2>{cinema.name}</h2>
                          <p>
                            <MapPinIcon size={15} aria-hidden="true" />
                            {cinema.areaLabel}
                          </p>
                        </div>
                        {route && routeOrigin && (
                          <div className="cinema-route-actions">
                            <strong className="cinema-route-time">
                              約{route.durationMinutes}分
                              <small>{routeEstimateDetail(route)}</small>
                            </strong>
                            <GoogleMapsRouteLink
                              cinema={cinema}
                              origin={routeOrigin}
                              route={route}
                            />
                          </div>
                        )}
                      </div>
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
              {timeGroups.map((group, index) => (
                <Fragment key={group.time}>
                  {index === currentTimeMarkerIndex && (
                    <CurrentTimeMarker
                      markerRef={currentTimeMarkerRef}
                      now={now}
                    />
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
                        const isPast = movie.showings.every((showing) =>
                          isShowingPast(showing, now),
                        );
                        const isStarred = starredMovieKeys.has(
                          movie.preferenceKey,
                        );
                        return (
                          <article
                            className={[
                              "program-block",
                              isPast ? "past" : "",
                              isStarred ? "starred" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={movie.key}
                          >
                            <div className="program-title">
                              <h2>{movie.title}</h2>
                              {schedule?.preferencesEnabled && (
                                <FavoriteButton
                                  title={movie.title}
                                  isStarred={isStarred}
                                  isSaving={savingMovieKeys.has(
                                    movie.preferenceKey,
                                  )}
                                  compact
                                  onClick={() => void toggleMovieStar(movie, null)}
                                />
                              )}
                            </div>
                            <div
                              className="cinema-strip"
                              role="list"
                              aria-label={`${movie.title}の上映館`}
                            >
                              {movie.showings.map((showing) => {
                                const route = routeByCinema.get(
                                  showing.cinemaId,
                                );
                                return (
                                  <CinemaSlot
                                    key={showing.id}
                                    showing={showing}
                                    route={route}
                                    isPast={isShowingPast(showing, now)}
                                    isReachable={Boolean(
                                      route &&
                                        isShowingReachable(
                                          showing,
                                          now,
                                          routeByCinema,
                                        ),
                                    )}
                                  />
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                </Fragment>
              ))}
              {showCurrentTimeMarkerAtEnd && (
                <CurrentTimeMarker
                  markerRef={currentTimeMarkerRef}
                  now={now}
                />
              )}
            </div>
          )}
        </section>
      </main>

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

function CinemaTravelTimes({
  rows,
  origin,
}: {
  rows: Array<{ cinema: Cinema; route: RouteEstimate }>;
  origin: { latitude: number; longitude: number };
}) {
  return (
    <section
      className="cinema-travel-times"
      aria-labelledby="cinema-travel-times-title"
    >
      <div className="cinema-travel-heading">
        <h2 id="cinema-travel-times-title">映画館までの目安</h2>
        <span>自宅から</span>
      </div>
      <ul>
        {rows.map(({ cinema, route }) => (
          <li key={cinema.id}>
            <span>{cinema.shortName}</span>
            <div className="cinema-travel-route">
              <strong>
                {routeTravelLabel(route)} 約{route.durationMinutes}分
                {route.customDurationMinutes !== undefined && "（設定）"}
              </strong>
              <GoogleMapsRouteLink
                cinema={cinema}
                origin={origin}
                route={route}
              />
            </div>
            {route.transitDetails && (
              <small className="cinema-travel-breakdown">
                {transitRouteSummary(route)}
              </small>
            )}
          </li>
        ))}
      </ul>
      <p>
        電車は石川町駅・伊勢佐木長者町駅のうち早い方を起点に、自宅から駅までの
        徒歩・平均待ち・乗換・映画館までの徒歩・余裕10分を含む固定目安です。
        自宅から駅までの徒歩は登録時に保存し、通常表示ではGoogle APIを呼びません。
        実際の公共交通経路は「Googleマップで案内」から確認できます。
        「間に合う」は現在時刻＋移動時間＋20分を中心に前後10分、かつ開始60分以内の
        上映です。
      </p>
    </section>
  );
}

function ProfilePanel({
  enabled,
  profile,
  state,
  error,
  onRegister,
  onDelete,
}: {
  enabled: boolean;
  profile: UserProfile;
  state: "idle" | "saving" | "deleting";
  error: string | null;
  onRegister: () => void;
  onDelete: () => void;
}) {
  const isBusy = state !== "idle";
  return (
    <section className="profile-panel" aria-labelledby="home-profile-title">
      <div className="profile-icon" aria-hidden="true">
        <HouseLineIcon size={27} />
      </div>
      <div className="profile-copy">
        <h2 id="home-profile-title">
          {profile.homeRegistered ? "自宅を登録済み" : "自宅を登録"}
        </h2>
        <p>
          {profile.homeRegistered
            ? "映画館までの時間は、登録した自宅位置を基準に固定して表示します。"
            : "今いる場所を自宅として一度登録すると、次回からGPSを取得せず同じ移動時間を表示します。"}
        </p>
        {profile.homeUpdatedAt && (
          <small>
            {updatedFormatter.format(new Date(profile.homeUpdatedAt))}登録
          </small>
        )}
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
          : profile.homeRegistered
            ? "現在地で自宅を更新"
            : "現在地を自宅として登録"}
      </button>
      <p className="profile-privacy-note">
        GPSはこの操作時だけ使用します。保存する座標は約10m単位に丸め、画面には表示しません。
      </p>
      {profile.homeRegistered && (
        <button
          type="button"
          className="profile-delete-action"
          disabled={isBusy}
          onClick={onDelete}
        >
          <TrashIcon size={15} aria-hidden="true" />
          {state === "deleting" ? "削除中" : "自宅情報を削除"}
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
  origin,
  route,
}: {
  cinema: Cinema;
  origin: { latitude: number; longitude: number };
  route: RouteEstimate;
}) {
  return (
    <a
      className="google-maps-route-link"
      href={buildGoogleMapsDirectionsUrl(origin, cinema, route.travelMode)}
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
  route,
  isPast,
  isReachable,
}: {
  showing: Showing;
  route?: RouteEstimate;
  isPast: boolean;
  isReachable: boolean;
}) {
  const start = timeFormatter.format(new Date(showing.startsAt));
  const end = showing.endsAt
    ? timeFormatter.format(new Date(showing.endsAt))
    : null;
  const metadata = [showing.screen, showing.format].filter(Boolean).join(" / ");

  return (
    <a
      className={[
        "cinema-slot",
        isPast ? "past" : "",
        isReachable ? "reachable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      href={showing.bookingUrl}
      target="_blank"
      rel="noreferrer"
      role="listitem"
      aria-label={`${isPast ? "開始済み " : ""}${start} ${showing.cinemaShortName}の公式予約ページを開く`}
    >
      <div className="slot-time">
        <strong>{start}</strong>
        <span className="slot-time-details">
          {end && <span>{end}終了</span>}
          {isPast && <span className="started-label">開始済み</span>}
          {isReachable && <span className="reachable-label">間に合う</span>}
        </span>
      </div>
      <div className="slot-cinema">
        <strong>{showing.cinemaShortName}</strong>
        <ArrowSquareOutIcon size={15} aria-hidden="true" />
      </div>
      {metadata && <span className="slot-meta">{metadata}</span>}
      {route && (
        <span className="slot-route">
          <MapPinIcon size={14} aria-hidden="true" />
          {routeTravelLabel(route)} 約{route.durationMinutes}分
          {route.customDurationMinutes !== undefined && "（設定）"}
          {route.mode === "estimate" && (
            <small>
              {route.customDurationMinutes !== undefined
                ? "ユーザー設定"
                : route.transitDetails
                ? `${route.transitDetails.originStationName}→${route.transitDetails.destinationStationName}`
                : route.travelMode === "transit"
                  ? "駅徒歩・余裕込"
                  : "目安"}
            </small>
          )}
        </span>
      )}
    </a>
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
