import { movieTitle, screeningInfo } from "./i18n";
import { useEffect, useState } from "react";
import { addDays, formatJstDate } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
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
    <PageShell className="movie-page" busy={loading} live="polite">
      <a href={hashForAppView("movies")}>{t("作品一覧に戻る")}</a>
      <PageHeader
        eyebrow={t("今後7日間の上映")}
        title={title ? movieTitle(title) : t("上映スケジュール")}
        lead={`${date.format(new Date(`${today}T12:00:00+09:00`))} - ${date.format(new Date(`${addDays(today, 6)}T12:00:00+09:00`))} (JST)`}
      />
      {title && (
        <p className="movie-original-title">
          <span lang="ja">{title}</span>
          {record?.originalTitle && record.originalTitle !== title && (
            <>
              {" "}
              · {t("原題")}: {record.originalTitle}
            </>
          )}
        </p>
      )}
      {record?.sourceUrl && (
        <p>
          <a href={record.sourceUrl} target="_blank" rel="noreferrer">
            {t(
              record.sourceKind === "official"
                ? "公式ページで確認"
                : "公開データベースで確認",
            )}
          </a>
        </p>
      )}
      {title && !record?.englishTitle && (
        <p>{t("英語題は調査中です。日本での公開題を表示しています。")}</p>
      )}
      {loading ? (
        <p>{t("読み込み中…")}</p>
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
        Array.from({ length: 7 }, (_, index) => addDays(today, index)).map(
          (day) => {
            const rows = showings.filter(
              (showing) => formatJstDate(new Date(showing.startsAt)) === day,
            );
            const cinemaIds = [...new Set(rows.map((row) => row.cinemaId))];
            return (
              <section className="movie-day" key={day}>
                <h2>
                  <time dateTime={day}>
                    {date.format(new Date(`${day}T12:00:00+09:00`))}
                  </time>
                </h2>
                {!rows.length ? (
                  <p>{t("この日の上映は未公開、または予定されていません。")}</p>
                ) : (
                  cinemaIds.map((cinemaId) => {
                    const screenings = rows.filter(
                      (row) => row.cinemaId === cinemaId,
                    );
                    return (
                      <div className="movie-cinema" key={cinemaId}>
                        <h3>{t(screenings[0].cinemaName)}</h3>
                        <ul className="movie-screenings">
                          {screenings.map((row) => (
                            <li key={row.id}>
                              <a
                                href={row.bookingUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <time dateTime={row.startsAt}>
                                  {time.format(new Date(row.startsAt))}
                                </time>
                                {row.endsAt && (
                                  <> - {time.format(new Date(row.endsAt))}</>
                                )}
                                <span>
                                  {screeningInfo(row.format ?? "")}
                                  {row.screen &&
                                    ` · ${screeningInfo(row.screen)}`}
                                </span>
                                <span>{t("公式サイト")}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
                )}
              </section>
            );
          },
        )
      )}
    </PageShell>
  );
}
