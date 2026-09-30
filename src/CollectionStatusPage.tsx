import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClockIcon,
  MinusCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type {
  CollectionDay,
  CollectionStatus,
} from "../shared/collection-status";
import type { Language } from "../shared/language";
import { translate } from "../shared/i18n";
import { PageHeader, PageShell } from "./PageLayout";
import { hashForAppView } from "./lib";
import { useDateSwipe } from "./useDateSwipe";

export function CollectionStatusPage({
  date,
  language,
}: {
  date: string;
  language: Language;
}) {
  const [data, setData] = useState<CollectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const datesRef = useRef<HTMLElement>(null);
  const [revision, setRevision] = useState(0);
  const swipeRef = useDateSwipe(!loading && !failed && !!data, date, (direction) => {
    const dates = data?.dates ?? [];
    const index = dates.indexOf(date);
    if (index < 0) return;
    const next = dates[index + (direction === "next" ? 1 : -1)];
    if (next) window.location.hash = hashForAppView("collectionStatus", { date: next });
  });
  const t = (ja: string, en: string) => (language === "en" ? en : ja);
  const locale = language === "en" ? "en-GB" : "ja-JP";
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(`${value}T12:00:00+09:00`));
  const formatTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Tokyo",
        }).format(new Date(value))
      : t("まだ確認していないよ", "Not checked yet");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch("/api/collection-status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_unavailable");
        const result = (await response.json()) as CollectionStatus;
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    datesRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "instant",
    });
  }, [data, date]);
  const rows = (data?.cinemas ?? []).flatMap((cinema) => {
    const day = cinema.days.find((day) => day.date === date);
    return day ? [{ cinema, day }] : [];
  });
  const checked = rows.filter(
    ({ day }) => day.status === "published" && !day.stale,
  ).length;
  const needsCheck = rows.filter(
    ({ day }) =>
      day.stale || day.status === "error" || day.status === "missing",
  ).length;
  const statusLabel = (day: CollectionDay) =>
    day.stale
      ? t("更新が古い", "Out of date")
      : {
          published: t("上映情報あり", "Showtimes found"),
          not_published: t("上映情報なし", "No showtimes returned"),
          error: t("取得できず", "Check failed"),
          missing: t("未確認", "Not checked"),
        }[day.status];
  const issueLabel = (issue: CollectionDay["issue"]) =>
    ({
      blocked: t(
        "公式サイトのアクセス制限で確認できなかったよ。",
        "The cinema restricted access.",
      ),
      timeout: t(
        "公式サイトの応答が間に合わなかったよ。",
        "The cinema did not respond in time.",
      ),
      parse: t(
        "公式サイトの上映情報を読み取れなかったよ。",
        "The cinema's schedule could not be read.",
      ),
      unknown: t(
        "今回は確認できなかったよ。次の定期更新でもう一度確認するね。",
        "This check failed. The next scheduled update will try again.",
      ),
    })[issue ?? "unknown"];
  return (
    <PageShell
      ref={swipeRef}
      className="collection-page"
      labelledBy="collection-title"
      busy={loading}
    >
      <PageHeader
        eyebrow={t("上映スケジュール", "Showtimes")}
        title={t("更新状況", "Schedule updates")}
        titleId="collection-title"
      />
      <div className="collection-toolbar">
        <a href={hashForAppView("schedule", { date })}>
          {t("上映スケジュールへ", "View showtimes")}
        </a>
        <button
          type="button"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <ArrowClockwiseIcon size={18} aria-hidden="true" />
          {t("状況を読み直す", "Reload status")}
        </button>
      </div>
      {failed && (
        <p role="alert">
          {t(
            "更新状況を読み込めなかったよ。もう一度試してね。",
            "Could not load the update status. Please try again.",
          )}
        </p>
      )}
      {loading && (
        <p role="status">{t("更新状況を確認中…", "Loading update status…")}</p>
      )}
      {data && (
        <>
          <nav
            className="collection-dates"
            data-horizontal-scroll="collection-dates"
            ref={datesRef}
            aria-label={t("確認する日", "Date to check")}
          >
            {data.dates.map((day) => (
              <a
                key={day}
                href={hashForAppView("collectionStatus", { date: day })}
                aria-current={day === date ? "date" : undefined}
              >
                {formatDate(day)}
              </a>
            ))}
          </nav>
          <section
            className="collection-overview"
            aria-labelledby="collection-day-title"
          >
            <p>{formatDate(date)}</p>
            <h2 id="collection-day-title">
              {t(
                `${checked} / ${rows.length}館で上映情報あり`,
                `Showtimes found at ${checked} of ${rows.length} cinemas`,
              )}
            </h2>
            <p>
              {t(
                "全件が揃ったとは限らないよ。最新情報は公式サイトへ。",
                "Schedules may still be incomplete. Check the official site for the latest.",
              )}
            </p>
            {needsCheck > 0 && (
              <p className="collection-attention">
                <WarningCircleIcon size={20} aria-hidden="true" />
                {t(
                  `${needsCheck}館は再確認が必要だよ`,
                  `${needsCheck} cinemas need another check`,
                )}
              </p>
            )}
          </section>
          {!rows.length && (
            <p>
              {t(
                "この日に確認対象の映画館はないよ。",
                "No cinemas are active on this date.",
              )}
            </p>
          )}
          <ul className="collection-cinemas" role="list">
            {rows.map(({ cinema, day }) => {
              const state = day.stale ? "stale" : day.status;
              const Icon =
                state === "published"
                  ? CheckCircleIcon
                  : state === "error"
                    ? WarningCircleIcon
                    : state === "not_published"
                      ? MinusCircleIcon
                      : ClockIcon;
              return (
                <li key={cinema.id} className={`collection-cinema is-${state}`}>
                  <div className="collection-cinema-heading">
                    <Icon size={24} aria-hidden="true" />
                    <h3>{translate(cinema.name, language)}</h3>
                    <span className="collection-result">
                      {statusLabel(day)}
                    </span>
                  </div>
                  <div className="collection-cinema-body">
                    {day.status === "published" && (
                      <p className="collection-count">
                        {t(
                          `${day.fetchedCount}上映を取得`,
                          `${day.fetchedCount} ${day.fetchedCount === 1 ? "screening" : "screenings"} fetched`,
                        )}
                      </p>
                    )}
                    <p>
                      {t("確認", "Checked")}{" "}
                      <time dateTime={day.lastAttemptAt ?? undefined}>
                        {formatTime(day.lastAttemptAt)}
                      </time>
                    </p>
                    {day.status !== "published" && day.storedCount > 0 && (
                      <p className="collection-retained">
                        {t(
                          `前回の${day.storedCount}上映を表示中だよ。`,
                          `Still showing ${day.storedCount} previously saved screenings.`,
                        )}
                      </p>
                    )}
                    <div className="collection-row-actions">
                      <a
                        href={cinema.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("公式サイト", "Official site")}
                        <ArrowSquareOutIcon size={16} aria-hidden="true" />
                      </a>
                      <details>
                        <summary>{t("詳しく見る", "Details")}</summary>
                        <dl>
                          <div>
                            <dt>
                              {t("最終正常確認", "Last successful check")}
                            </dt>
                            <dd>{formatTime(day.lastSuccessAt)}</dd>
                          </div>
                          <div>
                            <dt>{t("保存済み", "Saved showtimes")}</dt>
                            <dd>{day.storedCount}</dd>
                          </div>
                          <div>
                            <dt>
                              {t("保存データの更新", "Saved data updated")}
                            </dt>
                            <dd>
                              {day.storedUpdatedAt
                                ? formatTime(day.storedUpdatedAt)
                                : t("保存データなし", "No saved data")}
                            </dd>
                          </div>
                        </dl>
                        {day.status === "not_published" && (
                          <p>
                            {t(
                              "公式未公開・休館・上映なしは区別できないよ。",
                              "Unpublished schedules, closures and days without screenings cannot be distinguished.",
                            )}
                          </p>
                        )}
                        {day.status === "published" && (
                          <p>
                            {t(
                              "特別上映だけが先に公開されることもあるよ。",
                              "Special screenings may be published before the full schedule.",
                            )}
                          </p>
                        )}
                        {day.status === "error" && (
                          <p>{issueLabel(day.issue)}</p>
                        )}
                        {day.stale && (
                          <p>
                            {t(
                              "12時間以上、確認できていないよ。",
                              "No check has completed in over 12 hours.",
                            )}
                          </p>
                        )}
                      </details>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="collection-cadence">
            {t(
              "自動更新は1日4回。状況の読み直しでは、映画館へ再アクセスしないよ。",
              "Automatic updates run four times a day. Reloading this status does not contact the cinemas.",
            )}
          </p>
        </>
      )}
    </PageShell>
  );
}
