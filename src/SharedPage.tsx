import { groupSharedMovies } from "../shared/sharing";
import { useEffect, useState } from "react";
import {
  ArrowClockwiseIcon,
  CalendarDotsIcon,
  StarIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { SharedPlan, SharingResponse } from "../shared/sharing";
import { formatJstDate } from "../shared/date";
import { moviePreferenceKey, safeImageUrl } from "../shared/movie";
import { hashForAppView } from "./lib";
import {
  localize as t,
  localizedDate,
  movieTitle,
  registerTitleTranslations,
} from "./i18n";
import { PageHeader, PageShell } from "./PageLayout";

export function SharedPage() {
  const [data, setData] = useState<SharingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [member, setMember] = useState("");
  const [tab, setTab] = useState<"plans" | "movies">("plans");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    void fetch("/api/sharing", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("sharing_failed");
        const value: SharingResponse = await response.json();
        if (controller.signal.aborted) return;
        registerTitleTranslations(value.titles);
        setData(value);
        setMember((current) =>
          value.members.some((m) => m.userId === current) ? current : "",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const names = new Map(data?.members.map((m) => [m.userId, m.name]));
  const plans = new Map<string, SharedPlan[]>();
  for (const plan of data?.plans ?? []) {
    if (member && plan.userId !== member) continue;
    plans.set(plan.showingId, [...(plans.get(plan.showingId) ?? []), plan]);
  }
  const days = new Map<string, SharedPlan[][]>();
  for (const rows of plans.values()) {
    const day = formatJstDate(new Date(rows[0].startsAt));
    days.set(day, [...(days.get(day) ?? []), rows]);
  }
  const movies = groupSharedMovies(data?.movies ?? [], member);
  const date = localizedDate({
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const time = localizedDate({
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <PageShell className="shared-page" labelledBy="shared-title" busy={loading}>
      <PageHeader
        eyebrow={t("みんなの映画")}
        title={t("共有")}
        titleId="shared-title"
        meta={
          <button
            className="icon-button"
            type="button"
            disabled={loading}
            aria-label={t("再読み込み")}
            onClick={() => setRetry((v) => v + 1)}
          >
            <ArrowClockwiseIcon size={20} aria-hidden="true" />
          </button>
        }
      />
      <div className="shared-controls">
        <div
          className="shared-tabs"
          role="group"
          aria-label={t("共有する情報")}
        >
          <button
            type="button"
            aria-pressed={tab === "plans"}
            onClick={() => setTab("plans")}
          >
            <CalendarDotsIcon size={19} aria-hidden="true" />
            {t("みんなの予定")}
          </button>
          <button
            type="button"
            aria-pressed={tab === "movies"}
            onClick={() => setTab("movies")}
          >
            <StarIcon size={19} aria-hidden="true" />
            {t("気になる")}
          </button>
        </div>
        <label className="shared-member-filter">
          <UsersThreeIcon size={18} aria-hidden="true" />
          <span className="shared-filter-label">{t("メンバー")}</span>
          <select
            value={member}
            onChange={(e) => setMember(e.target.value)}
            disabled={loading}
          >
            <option value="">{t("全員")}</option>
            {(data?.members ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
                {m.userId === data?.userId ? ` ${t("（自分）")}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status">{t("読み込み中…")}</p>
      ) : error ? (
        <p role="alert">
          {t("共有データを取得できませんでした。再読み込みしてください。")}
        </p>
      ) : tab === "plans" ? (
        <>
          {!plans.size && (
            <div className="shared-empty">
              <CalendarDotsIcon size={32} aria-hidden="true" />
              <p>{t("共有されている鑑賞予定はありません。")}</p>
              <a href={hashForAppView("schedule")}>
                {t("上映スケジュールから選ぶ")}
              </a>
            </div>
          )}
          {[...days].map(([day, items]) => (
            <section className="shared-day" key={day}>
              <h2>
                <time dateTime={day}>
                  {date.format(new Date(`${day}T12:00:00+09:00`))}
                </time>
              </h2>
              <ol className="screening-timeline">
                {items.map((rows) => {
                  const plan = rows[0];
                  return (
                    <li key={plan.showingId}>
                      <div className="screening-clock">
                        <time dateTime={plan.startsAt}>
                          {time.format(new Date(plan.startsAt))}
                        </time>
                        {plan.endsAt && (
                          <span>{time.format(new Date(plan.endsAt))}</span>
                        )}
                      </div>
                      <div className="screening-content">
                        <a
                          className="shared-film-title"
                          href={hashForAppView("movie", {
                            movie: moviePreferenceKey(plan.title),
                          })}
                        >
                          {movieTitle(plan.title)}
                        </a>
                        <p>{t(plan.cinemaName)}</p>
                        <ul
                          className="shared-people"
                          aria-label={t("鑑賞するメンバー")}
                        >
                          {rows.map((p) => (
                            <li key={p.userId}>
                              <span>{names.get(p.userId)}</span>
                              {p.reserved && (
                                <span className="shared-reserved">
                                  {t("予約済み")}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </>
      ) : (
        <>
          {!movies.size && (
            <div className="shared-empty">
              <StarIcon size={32} aria-hidden="true" />
              <p>{t("気になる作品はまだありません。")}</p>
              <a href={hashForAppView("movies")}>{t("上映作品")}</a>
            </div>
          )}
          <ul className="shared-movies">
            {[...movies].map(([key, rows]) => {
              const movie = rows[0],
                image = safeImageUrl(
                  rows.find((m) => safeImageUrl(m.imageUrl))?.imageUrl,
                );
              return (
                <li key={key}>
                  <div>
                    <a
                      className="shared-film-title"
                      href={hashForAppView("movie", { movie: key })}
                    >
                      {movieTitle(movie.title)}
                    </a>
                    <ul
                      className="shared-people"
                      aria-label={t("気になっているメンバー")}
                    >
                      {rows.map((m) => (
                        <li key={m.userId}>
                          <StarIcon
                            size={14}
                            weight="fill"
                            aria-hidden="true"
                          />
                          <span>{names.get(m.userId)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {image && (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.hidden = true;
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageShell>
  );
}
