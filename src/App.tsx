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
  groupByMovie,
} from "./lib";

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
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
  const movieGroups = useMemo(
    () => groupByMovie(visibleShowings),
    [visibleShowings],
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

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="今日の横浜映画 ホーム">
            <span className="brand-mark" aria-hidden="true">
              Y
            </span>
            <span>
              <strong>今日の横浜映画</strong>
              <small>PRIVATE SCHEDULE</small>
            </span>
          </a>
          <form method="post" action="/auth/logout">
            <button
              className="quiet-button"
              type="submit"
              aria-label="ログアウト"
            >
              <SignOutIcon size={18} aria-hidden="true" />
              <span>ログアウト</span>
            </button>
          </form>
        </div>
      </header>

      <main id="main">
        <section className="intro" aria-labelledby="page-heading">
          <p className="eyebrow">Yokohama / Sakuragicho / Kannai</p>
          <h1 id="page-heading">今から観られる映画</h1>
          <p className="lead">
            横浜周辺の映画館をまたいで、上映開始が近い順にまとめています。
          </p>
        </section>

        <section className="control-panel" aria-label="上映日の選択">
          <div className="date-tabs" role="group" aria-label="日付">
            {dates.map((date, index) => (
              <button
                key={date}
                className={date === selectedDate ? "date-tab active" : "date-tab"}
                type="button"
                aria-pressed={date === selectedDate}
                onClick={() => setSelectedDate(date)}
              >
                <span>{index === 0 ? "今日" : dateFormatter.format(new Date(`${date}T12:00:00+09:00`)).split("(")[0]}</span>
                <small>
                  {dateFormatter
                    .format(new Date(`${date}T12:00:00+09:00`))
                    .match(/\((.+)\)/)?.[1] ?? ""}
                </small>
              </button>
            ))}
          </div>

          <div className="filters">
            <div className="area-filters" role="group" aria-label="エリア">
              {AREA_OPTIONS.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  className={selectedArea === area.id ? "chip active" : "chip"}
                  aria-pressed={selectedArea === area.id}
                  onClick={() => setSelectedArea(area.id)}
                >
                  {area.label}
                </button>
              ))}
            </div>
            <div className="filter-actions">
              {selectedDate === dates[0] && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={futureOnly}
                    onChange={(event) => setFutureOnly(event.target.checked)}
                  />
                  <span>今から間に合う上映だけ</span>
                </label>
              )}
              <button
                type="button"
                className="location-button"
                onClick={requestLocation}
                disabled={locationState === "loading"}
              >
                <CrosshairIcon size={18} aria-hidden="true" />
                {locationState === "loading"
                  ? "現在地を確認中…"
                  : locationState === "ready"
                    ? "現在地を再取得"
                    : "現在地から探す"}
              </button>
            </div>
          </div>
          {locationState === "ready" && (
            <p className="location-note" role="status">
              <CheckCircleIcon size={17} weight="fill" aria-hidden="true" />
              現在地からの徒歩時間を反映しました。表示は目安です。
            </p>
          )}
          {locationState === "error" && (
            <p className="location-note error" role="status">
              <WarningCircleIcon size={17} aria-hidden="true" />
              現在地を取得できませんでした。通常の上映一覧を表示します。
            </p>
          )}
        </section>

        <section className="results" aria-live="polite" aria-busy={loading}>
          <ResultsHeader
            count={movieGroups.length}
            schedule={schedule}
            loading={loading}
          />
          {loading && <LoadingState />}
          {!loading && error && (
            <div className="state-card error-state" role="alert">
              <WarningCircleIcon size={26} aria-hidden="true" />
              <div>
                <strong>読み込みに失敗しました</strong>
                <p>{error}</p>
              </div>
              <button type="button" onClick={() => window.location.reload()}>
                再読み込み
              </button>
            </div>
          )}
          {!loading && !error && movieGroups.length === 0 && (
            <div className="state-card">
              <ClockIcon size={26} aria-hidden="true" />
              <div>
                <strong>条件に合う上映がありません</strong>
                <p>
                  エリアを広げるか、「今から間に合う上映だけ」を解除してみてください。
                </p>
              </div>
            </div>
          )}
          {!loading &&
            !error &&
            movieGroups.map((group) => (
              <article className="movie-card" key={group.key}>
                <div className="movie-heading">
                  <h2>{group.title}</h2>
                  <span>{group.showings.length} 回</span>
                </div>
                <div className="showing-list">
                  {group.showings.map((showing) => (
                    <ShowingRow
                      key={showing.id}
                      showing={showing}
                      route={routeByCinema.get(showing.cinemaId)}
                    />
                  ))}
                </div>
              </article>
            ))}
        </section>
      </main>

      <footer>
        <p>
          上映時刻は各映画館の公式情報をもとにした参考情報です。購入前に公式サイトでご確認ください。
        </p>
      </footer>
    </>
  );
}

function ResultsHeader({
  count,
  schedule,
  loading,
}: {
  count: number;
  schedule: ScheduleResponse | null;
  loading: boolean;
}) {
  return (
    <div className="results-header">
      <h2>{loading ? "上映情報を確認中" : `${count}作品`}</h2>
      {schedule?.lastUpdatedAt && (
        <p>
          {updatedFormatter.format(new Date(schedule.lastUpdatedAt))} 更新
          {schedule.sourceHealth.total > 0 &&
            schedule.sourceHealth.healthy < schedule.sourceHealth.total &&
            ` · ${schedule.sourceHealth.total - schedule.sourceHealth.healthy}館は更新確認できず`}
        </p>
      )}
    </div>
  );
}

function ShowingRow({
  showing,
  route,
}: {
  showing: Showing;
  route?: RouteEstimate;
}) {
  return (
    <div className="showing-row">
      <div className="showing-time">
        <strong>{timeFormatter.format(new Date(showing.startsAt))}</strong>
        {showing.endsAt && (
          <span>– {timeFormatter.format(new Date(showing.endsAt))}</span>
        )}
      </div>
      <div className="showing-place">
        <strong>{showing.cinemaShortName}</strong>
        <span>
          {[showing.screen, showing.format].filter(Boolean).join(" · ") ||
            showing.area}
        </span>
      </div>
      {route && (
        <div
          className="route-badge"
          title={
            route.mode === "route"
              ? "経路検索による徒歩時間"
              : "直線距離から計算した徒歩時間の目安"
          }
        >
          <MapPinIcon size={15} aria-hidden="true" />
          徒歩約{route.durationMinutes}分
          {route.mode === "estimate" && <small>目安</small>}
        </div>
      )}
      <a
        className="booking-link"
        href={showing.bookingUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${showing.cinemaShortName} ${timeFormatter.format(new Date(showing.startsAt))}の公式予約ページを開く`}
      >
        公式サイト
        <ArrowSquareOutIcon size={16} aria-hidden="true" />
      </a>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-list" aria-label="読み込み中">
      {[0, 1, 2].map((item) => (
        <div className="skeleton-card" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
