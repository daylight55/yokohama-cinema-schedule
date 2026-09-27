import { movieTitle, screeningInfo } from "./i18n";
import { useEffect, useState } from "react";
import { addDays, formatJstDate } from "../shared/date";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { moviePreferenceKey, safeImageUrl } from "../shared/movie";
import type { ScheduleResponse } from "../shared/types";
import { hashForAppView } from "./lib";
import {
  localize as t,
  localizedDate,
  registerTitleTranslations,
} from "./i18n";
import { PageHeader, PageShell } from "./PageLayout";

export function MoviePage({
  movieKey,
  today,
}: {
  movieKey: string | null;
  today: string;
}) {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    setLoading(true);
    const params = new URLSearchParams({
      date: today,
      through: addDays(today, 6),
    });
    void fetch(`/api/showings?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("showings_failed");
        const result = (await response.json()) as ScheduleResponse;
        if (controller.signal.aborted) return;
        registerTitleTranslations(result.movieTitles ?? []);
        setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [today, movieKey, retry]);
  const showings = (data?.showings ?? []).filter(
    (showing) => moviePreferenceKey(showing.title) === movieKey,
  );
  const title = showings[0]?.title;
  const poster = safeImageUrl(
    showings.find((row) => safeImageUrl(row.imageUrl))?.imageUrl,
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const record = data?.movieTitles?.find((row) => row.titleKey === movieKey);
  const date = localizedDate({
    month: "short",
    day: "numeric",
    weekday: "short",
  });
  const time = localizedDate({
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <PageShell className="movie-page" busy={loading} labelledBy="movie-title">
      <a className="movie-back" href={hashForAppView("movies")}>
        <ArrowLeftIcon size={18} aria-hidden="true" />
        {t("作品一覧に戻る")}
      </a>
      <div className="movie-overview">
        <div className="movie-overview-copy">
          <PageHeader
            eyebrow={t("今後7日間の上映")}
            title={title ? movieTitle(title) : t("上映スケジュール")}
            titleId="movie-title"
          />
          {record?.originalTitle &&
            record.originalTitle !== movieTitle(title ?? "") && (
              <p className="movie-original-title">{record.originalTitle}</p>
            )}
          {record?.sourceUrl && (
            <a
              className="movie-source"
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("作品情報")}
              <ArrowSquareOutIcon size={14} aria-hidden="true" />
            </a>
          )}
        </div>
        {poster && (
          <img
            className="movie-poster"
            key={poster}
            src={poster}
            alt={title ? movieTitle(title) : ""}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
        )}
      </div>
      {loading ? (
        <p role="status">{t("読み込み中…")}</p>
      ) : error ? (
        <div role="alert">
          <p>{t("スケジュールを取得できませんでした")}</p>
          <button onClick={() => setRetry((value) => value + 1)}>
            {t("再読み込み")}
          </button>
        </div>
      ) : !movieKey ? (
        <p>{t("作品を選択してください。")}</p>
      ) : !showings.length ? (
        <p>{t("この作品の上映情報が見つかりません。")}</p>
      ) : (
        <>
          <nav className="movie-day-nav" aria-label={t("上映日へ移動")}>
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  const heading = document.getElementById(`movie-day-${day}`);
                  heading?.scrollIntoView({
                    behavior: "instant",
                    block: "start",
                  });
                  heading?.focus({ preventScroll: true });
                }}
              >
                {date.format(new Date(`${day}T12:00:00+09:00`))}
              </button>
            ))}
          </nav>
          {days.map((day) => {
            const rows = showings
              .filter((row) => formatJstDate(new Date(row.startsAt)) === day)
              .sort(
                (a, b) =>
                  a.startsAt.localeCompare(b.startsAt) ||
                  a.cinemaName.localeCompare(b.cinemaName),
              );
            return (
              <section
                className="movie-day"
                key={day}
                aria-labelledby={`movie-day-${day}`}
              >
                <h2 id={`movie-day-${day}`} tabIndex={-1}>
                  <time dateTime={day}>
                    {date.format(new Date(`${day}T12:00:00+09:00`))}
                  </time>
                </h2>
                {!rows.length ? (
                  <p className="movie-day-empty">{t("上映予定なし")}</p>
                ) : (
                  <ol className="screening-timeline">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <div className="screening-clock">
                          <time dateTime={row.startsAt}>
                            {time.format(new Date(row.startsAt))}
                          </time>
                          {row.endsAt && (
                            <span>{time.format(new Date(row.endsAt))}</span>
                          )}
                        </div>
                        <a
                          className="screening-content screening-booking"
                          href={row.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${time.format(new Date(row.startsAt))} ${t(row.cinemaName)} ${t("公式サイト")}`}
                        >
                          <div className="screening-description">
                            <h3>{t(row.cinemaName)}</h3>
                            {(row.screen || row.format) && (
                              <p>
                                {[row.screen, row.format]
                                  .filter(Boolean)
                                  .map((value) => screeningInfo(value!))
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <ArrowSquareOutIcon size={20} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </>
      )}
    </PageShell>
  );
}
