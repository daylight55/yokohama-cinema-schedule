import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClockIcon,
  CrosshairIcon,
  MapPinIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { todayInJst } from "../shared/date";
import type {
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
  const today = todayInJst(now);
  const dates = useMemo(() => buildDates(now), [today]);
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [selectedArea, setSelectedArea] = useState<CinemaArea | "all">("all");
  const [futureOnly, setFutureOnly] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [routes, setRoutes] = useState<RouteEstimate[]>([]);
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
      .then(setSchedule)
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
  const visibleShowings = useMemo(
    () =>
      filterShowings(schedule?.showings ?? [], {
        selectedArea,
        futureOnly: futureOnly && selectedDate === dates[0],
        now,
        routeByCinema,
      }),
    [
      dates,
      futureOnly,
      now,
      routeByCinema,
      schedule?.showings,
      selectedArea,
      selectedDate,
    ],
  );
  const hourGroups = useMemo(
    () => groupByScheduleHour(visibleShowings),
    [visibleShowings],
  );
  const movieCount = useMemo(
    () =>
      new Set(
        hourGroups.flatMap((group) =>
          group.movies.map((movie) => movie.key),
        ),
      ).size,
    [hourGroups],
  );

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
          setLocationState("ready");
        } catch {
          setLocationState("error");
        }
      },
      () => setLocationState("error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
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

          <div className="control-row">
            {selectedDate === dates[0] ? (
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
            ) : (
              <span className="all-day-label">全時間を表示</span>
            )}
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
          </div>

          {locationState === "ready" && (
            <p className="inline-status" role="status">
              <CheckCircleIcon size={16} weight="fill" aria-hidden="true" />
              徒歩時間を反映しました
            </p>
          )}
          {locationState === "error" && (
            <p className="inline-status error" role="status">
              <WarningCircleIcon size={16} aria-hidden="true" />
              現在地を取得できませんでした
            </p>
          )}
        </section>

        <section className="guide" aria-live="polite" aria-busy={loading}>
          <div className="guide-heading">
            <div>
              <p>{selectedDateLabel}</p>
              <h1>上映スケジュール</h1>
            </div>
            {!loading && !error && (
              <span>
                {movieCount}作品
                <small>{visibleShowings.length}上映</small>
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

          {loading && <LoadingTimeline />}
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
          {!loading && !error && hourGroups.length === 0 && (
            <div className="state-card">
              <ClockIcon size={25} aria-hidden="true" />
              <div>
                <strong>条件に合う上映がありません</strong>
                <p>エリアを広げるか、全時間に切り替えてください。</p>
              </div>
            </div>
          )}
          {!loading && !error && hourGroups.length > 0 && (
            <div className="timeline">
              {hourGroups.map((group) => (
                <section
                  className="timeline-hour"
                  id={`hour-${group.hour}`}
                  key={group.hour}
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
                    {group.movies.map((movie) => (
                      <article className="program-block" key={movie.key}>
                        <div className="program-title">
                          <h2>{movie.title}</h2>
                          {movie.showings.length > 1 && (
                            <span>横にスワイプ</span>
                          )}
                        </div>
                        <div
                          className="cinema-strip"
                          role="list"
                          aria-label={`${movie.title}の上映館`}
                        >
                          {movie.showings.map((showing) => (
                            <CinemaSlot
                              key={showing.id}
                              showing={showing}
                              route={routeByCinema.get(showing.cinemaId)}
                            />
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
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

function CinemaSlot({
  showing,
  route,
}: {
  showing: Showing;
  route?: RouteEstimate;
}) {
  const start = timeFormatter.format(new Date(showing.startsAt));
  const end = showing.endsAt
    ? timeFormatter.format(new Date(showing.endsAt))
    : null;
  const metadata = [showing.screen, showing.format].filter(Boolean).join(" / ");

  return (
    <a
      className="cinema-slot"
      href={showing.bookingUrl}
      target="_blank"
      rel="noreferrer"
      role="listitem"
      aria-label={`${start} ${showing.cinemaShortName}の公式予約ページを開く`}
    >
      <div className="slot-time">
        <strong>{start}</strong>
        {end && <span>{end}終了</span>}
      </div>
      <div className="slot-cinema">
        <strong>{showing.cinemaShortName}</strong>
        <ArrowSquareOutIcon size={15} aria-hidden="true" />
      </div>
      {metadata && <span className="slot-meta">{metadata}</span>}
      {route && (
        <span className="slot-route">
          <MapPinIcon size={14} aria-hidden="true" />
          徒歩約{route.durationMinutes}分
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
