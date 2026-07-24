import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClockIcon,
  CrosshairIcon,
  MapPinIcon,
  SignOutIcon,
  StarIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { todayInJst } from "../shared/date";
import type {
  Cinema,
  CinemaArea,
  RouteEstimate,
  RoutesResponse,
  ScheduleResponse,
  Showing,
} from "../shared/types";
import {
  AREA_OPTIONS,
  buildDates,
  filterShowings,
  groupByScheduleHour,
  groupByMovie,
  isShowingPast,
  isShowingReachable,
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

export function App() {
  const [now, setNow] = useState(() => new Date());
  const currentTimeMarkerRef = useRef<HTMLDivElement>(null);
  const didInitialTimeScrollRef = useRef(false);
  const today = todayInJst(now);
  const dates = useMemo(() => buildDates(now), [today]);
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [selectedArea, setSelectedArea] = useState<CinemaArea | "all">("all");
  const [futureOnly, setFutureOnly] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [routes, setRoutes] = useState<RouteEstimate[]>([]);
  const [routeProvider, setRouteProvider] =
    useState<RoutesResponse["provider"]>("estimate");
  const [view, setView] = useState<"schedule" | "movies">("schedule");
  const [starredMovieKeys, setStarredMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingMovieKeys, setSavingMovieKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

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
  const hasTransitRoutes = routes.some(
    (route) => route.travelMode === "transit",
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
  const hourGroups = useMemo(
    () => groupByScheduleHour(visibleShowings),
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
        hourGroups.flatMap((group) =>
          group.movies.map((movie) => movie.key),
        ),
      ).size,
    [hourGroups],
  );
  const currentHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const currentTimeMarkerIndex =
    selectedDate === today
      ? hourGroups.findIndex((group) => Number(group.hour) >= currentHour)
      : -1;
  const showCurrentTimeMarkerAtEnd =
    selectedDate === today &&
    hourGroups.length > 0 &&
    currentTimeMarkerIndex === -1;

  useEffect(() => {
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

    const frame = window.requestAnimationFrame(() => {
      if (didInitialTimeScrollRef.current) return;
      const marker = currentTimeMarkerRef.current;
      if (!marker) return;
      marker.scrollIntoView({ behavior: "auto", block: "start" });
      didInitialTimeScrollRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, hourGroups, loading, selectedDate, today, view]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("error");
      return;
    }
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch("/api/routes", {
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
          const data = (await response.json()) as RoutesResponse;
          setRoutes(data.routes);
          setRouteProvider(data.provider);
          setLocationState("ready");
        } catch {
          setLocationState("error");
        }
      },
      () => setLocationState("error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const toggleMovieStar = async (movie: {
    preferenceKey: string;
    title: string;
    imageUrl: string | null;
  }) => {
    if (savingMovieKeys.has(movie.preferenceKey)) return;
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

      <main id="main">
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

          <div className="view-switch" role="group" aria-label="表示形式">
            <button
              type="button"
              className={view === "schedule" ? "active" : ""}
              aria-pressed={view === "schedule"}
              onClick={() => setView("schedule")}
            >
              番組表
            </button>
            <button
              type="button"
              className={view === "movies" ? "active" : ""}
              aria-pressed={view === "movies"}
              onClick={() => setView("movies")}
            >
              作品一覧
            </button>
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
            ) : (
              <span className="all-day-label">
                {schedule?.preferencesEnabled
                  ? "スター済みを先頭に表示"
                  : "作品名順に表示"}
              </span>
            )}
            {view === "schedule" && (
              <button
                type="button"
                className="location-button"
                onClick={requestLocation}
                disabled={locationState === "loading"}
              >
                <CrosshairIcon size={17} aria-hidden="true" />
                {locationState === "loading"
                  ? "取得中"
                  : locationState === "ready"
                    ? "現在地を更新"
                    : "現在地"}
              </button>
            )}
          </div>

          {view === "schedule" && locationState === "ready" && (
            <p className="inline-status" role="status">
              <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />
              {hasTransitRoutes
                ? "電車・徒歩の所要時間を反映しました"
                : routeProvider === "custom"
                  ? "経路に沿った徒歩時間を反映しました"
                  : "徒歩時間の目安を反映しました"}
            </p>
          )}
          {view === "schedule" && locationState === "error" && (
            <p className="inline-status error" role="status">
              <WarningCircleIcon size={16} aria-hidden="true" />
              現在地を取得できませんでした
            </p>
          )}
          {view === "schedule" &&
            locationState === "ready" &&
            cinemaTravelRows.length > 0 && (
              <CinemaTravelTimes rows={cinemaTravelRows} />
            )}
          {preferenceError && (
            <p className="inline-status error" role="status">
              <WarningCircleIcon size={16} aria-hidden="true" />
              {preferenceError}
            </p>
          )}
        </section>

        <section className="guide" aria-live="polite" aria-busy={loading}>
          <div className="guide-heading">
            <div>
              <p>{selectedDateLabel}</p>
              <h1>
                {view === "schedule" ? "上映スケジュール" : "上映中の作品"}
              </h1>
            </div>
            {!loading && !error && (
              <span>
                {view === "schedule" ? movieCount : movieList.length}作品
                {view === "schedule" && (
                  <small>{visibleShowings.length}上映</small>
                )}
              </span>
            )}
          </div>

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
              ? hourGroups.length === 0
              : movieList.length === 0) && (
            <div className="state-card">
              <ClockIcon size={25} aria-hidden="true" />
              <div>
                <strong>
                  {view === "schedule"
                    ? "条件に合う上映がありません"
                    : "上映中の作品がありません"}
                </strong>
                <p>エリアを広げるか、別の日を選んでください。</p>
              </div>
            </div>
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
                        onClick={() => void toggleMovieStar(movie)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!loading &&
            !error &&
            view === "schedule" &&
            hourGroups.length > 0 && (
            <div className="timeline">
              {hourGroups.map((group, index) => (
                <Fragment key={group.hour}>
                  {index === currentTimeMarkerIndex && (
                    <CurrentTimeMarker
                      markerRef={currentTimeMarkerRef}
                      now={now}
                    />
                  )}
                  <section
                    className="timeline-hour"
                    id={`hour-${group.hour}`}
                    aria-labelledby={`hour-label-${group.hour}`}
                  >
                    <div className="hour-label">
                      <time
                        id={`hour-label-${group.hour}`}
                        dateTime={`${selectedDate}T${group.hour}:00:00+09:00`}
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
                                  onClick={() => void toggleMovieStar(movie)}
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
  onClick: () => void;
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
}: {
  rows: Array<{ cinema: Cinema; route: RouteEstimate }>;
}) {
  return (
    <section
      className="cinema-travel-times"
      aria-labelledby="cinema-travel-times-title"
    >
      <div className="cinema-travel-heading">
        <h2 id="cinema-travel-times-title">映画館までの目安</h2>
        <span>現在地から</span>
      </div>
      <ul>
        {rows.map(({ cinema, route }) => (
          <li key={cinema.id}>
            <span>{cinema.shortName}</span>
            <strong>
              {routeTravelLabel(route)} 約{route.durationMinutes}分
            </strong>
          </li>
        ))}
      </ul>
      <p>「間に合う」は開始60分以内かつ、移動時間＋準備10分に収まる上映です。</p>
    </section>
  );
}

function routeTravelLabel(route: RouteEstimate): string {
  if (route.travelMode === "transit") return "電車・徒歩";
  return route.mode === "estimate" ? "徒歩目安" : "徒歩";
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
          {route.mode === "estimate" && <small>目安</small>}
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
