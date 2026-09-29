import { useEffect, useState } from "react";
import type { MemberPageResponse } from "../shared/member-page";
import { PageHeader, PageShell } from "./PageLayout";
import { MemberAvatar } from "./MemberProfile";
import {
  localize as t,
  localizedDate,
  movieTitle,
  registerTitleTranslations,
} from "./i18n";
import { hashForAppView } from "./lib";
import { moviePreferenceKey } from "../shared/movie";

export function MemberActivity({
  userId = "",
  onLoaded,
}: {
  userId?: string;
  onLoaded?: (data: MemberPageResponse | null) => void;
}) {
  const [data, setData] = useState<MemberPageResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"watchlist" | "watched" | "plans">(
    "watchlist",
  );
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    onLoaded?.(null);
    setError("");
    setTab("watchlist");
    void fetch(
      `/api/member-page${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`,
      { signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 404 || response.status === 403
              ? "このマイページは表示できません。同じグループのメンバーのみ閲覧できます。"
              : "映画の記録を読み込めませんでした。",
          );
        const value: MemberPageResponse = await response.json();
        if (!abort.signal.aborted) {
          registerTitleTranslations(value.titles);
          setData(value);
          onLoaded?.(value);
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(reason.message || "映画の記録を読み込めませんでした。");
      });
    return () => abort.abort();
  }, [userId, attempt, onLoaded]);
  const watchlist = data?.movies.filter((m) => m.status !== "watched") ?? [];
  const watched = data?.movies.filter((m) => m.status === "watched") ?? [];
  const movies = tab === "watched" ? watched : watchlist;
  const date = localizedDate({
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="member-activity" aria-label={t("映画の記録")}>
      {error ? (
        <div role="alert">
          <p>{t(error)}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {t("再読み込み")}
          </button>
        </div>
      ) : !data ? (
        <p role="status">{t("読み込み中…")}</p>
      ) : (
        <>
          <h2>{t("映画の記録")}</h2>
          {data.isSelf && (
            <p className="account-muted">
              {t("映画の記録は同じグループのメンバーに表示されます。")}
            </p>
          )}
          <div
            className="member-activity-tabs"
            role="group"
            aria-label={t("映画の記録")}
          >
            {(
              [
                ["watchlist", "気になる", watchlist.length],
                ["watched", "鑑賞済み", watched.length],
                ["plans", "鑑賞予定", data.plans.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {t(label)} <span>{count}</span>
              </button>
            ))}
          </div>
          <div
            key={tab}
            className="member-activity-scroll"
            role="region"
            aria-label={t(tab === "plans" ? "鑑賞予定" : tab === "watched" ? "鑑賞済み" : "気になる")}
            tabIndex={0}
          >
            {tab === "plans" ? (
              data.plans.length ? (
                <ul className="member-plan-list">
                  {data.plans.map((plan) => (
                    <li key={plan.showingId}>
                      <a
                        href={hashForAppView("movie", {
                          movie: moviePreferenceKey(plan.title),
                        })}
                      >
                        <span>{movieTitle(plan.title)}</span>
                        <span className="member-plan-meta">
                          <time dateTime={plan.startsAt}>{date.format(new Date(plan.startsAt))}</time>
                          {" · "}{t(plan.cinemaName)}
                          {plan.reserved ? ` · ${t("予約済み")}` : ""}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="account-muted">
                  {t("今後の鑑賞予定はまだありません。")}
                </p>
              )
            ) : movies.length ? (
              <ul className="member-movie-list">
                {movies.map((movie) => (
                  <li key={movie.movieKey}>
                    <a href={hashForAppView("movie", { movie: movie.movieKey })}>
                      {movie.imageUrl && (
                        <img
                          src={movie.imageUrl}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      )}
                      <span>{movieTitle(movie.title)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="account-muted">
                {t(
                  tab === "watched"
                    ? "鑑賞済みの映画はまだありません。"
                    : "気になる映画はまだありません。",
                )}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function MemberPage({ userId }: { userId: string }) {
  const [data, setData] = useState<MemberPageResponse | null>(null);
  useEffect(() => setData(null), [userId]);
  return (
    <PageShell className="member-page" labelledBy="member-page-title">
      <PageHeader
        eyebrow={t("みんなの映画")}
        title={data?.profile.displayName ?? t("マイページ")}
        titleId="member-page-title"
      />
      {data && (
        <div className="member-page-profile">
          <MemberAvatar
            name={data.profile.displayName}
            url={data.profile.avatarUrl}
            large
          />
          <div>
            <p>{data.profile.bio}</p>
            {data.isSelf && <a href="#account">{t("プロフィールを編集")}</a>}
          </div>
        </div>
      )}
      <MemberActivity key={userId} userId={userId} onLoaded={setData} />
    </PageShell>
  );
}
