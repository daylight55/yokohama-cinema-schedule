import { movieTitle } from "./i18n";
import { localize, localizedDate } from "./i18n";
import {
  ArrowSquareOutIcon,
  CalendarDotsIcon,
  ClockIcon,
  MapPinIcon,
  StarIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { formatJstDate } from "../shared/date";
import type { ViewingPlan } from "../shared/types";
import { hashForAppView } from "./lib";
import { PageHeader, PageShell } from "./PageLayout";

const dateFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = localizedDate({
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localTime(value: string | null): string {
  return value ? timeFormatter.format(new Date(value)) : "終了時刻未定";
}

export function ViewingPlansPage({
  plans,
  starredMovieKeys,
  loading,
  error,
  savingIds,
  onRemove,
  onReservationChange,
}: {
  plans: ViewingPlan[];
  starredMovieKeys: Set<string>;
  loading: boolean;
  error: string | null;
  savingIds: Set<string>;
  onRemove(plan: ViewingPlan): Promise<void>;
  onReservationChange(plan: ViewingPlan, reserved: boolean): Promise<void>;
}) {
  const groupedPlans = plans.reduce<Map<string, ViewingPlan[]>>(
    (groups, plan) => {
      const date = formatJstDate(new Date(plan.startsAt));
      const items = groups.get(date) ?? [];
      items.push(plan);
      groups.set(date, items);
      return groups;
    },
    new Map(),
  );

  return (
    <PageShell
      className="viewing-plans-page"
      labelledBy="viewing-plans-title"
      busy={loading}
      live="polite"
    >
      <PageHeader
        eyebrow={localize("映画を観に行く予定")}
        title={localize("鑑賞予定")}
        titleId="viewing-plans-title"
        meta={
          !loading && !error ? (
            <span className="page-count">
              {localize(plans.length)}
              {localize("本")}
            </span>
          ) : null
        }
      />

      {localize(
        loading && (
          <p className="viewing-plans-status">{localize("読み込み中…")}</p>
        ),
      )}
      {localize(
        error && (
          <p className="viewing-plans-status error" role="alert">
            {localize(error)}
          </p>
        ),
      )}
      {localize(
        !loading && !error && plans.length === 0 && (
          <div className="viewing-plans-empty">
            <CalendarDotsIcon size={30} aria-hidden="true" />
            <p>{localize("登録されている鑑賞予定はありません。")}</p>
            <a href={hashForAppView("schedule")}>
              {localize("上映スケジュールから選ぶ")}
            </a>
          </div>
        ),
      )}

      {localize(
        [...groupedPlans.entries()].map(([date, datePlans]) => (
          <section className="viewing-plan-day" key={date}>
            <h2>
              {localize(
                dateFormatter.format(new Date(`${date}T12:00:00+09:00`)),
              )}
            </h2>
            <ol className="plan-timeline viewing-plan-timeline">
              {localize(
                datePlans.map((plan) => (
                  <li key={plan.showingId}>
                    <article>
                      <div className="plan-time">
                        <ClockIcon size={16} aria-hidden="true" />
                        <time dateTime={plan.startsAt}>
                          {localize(localTime(plan.startsAt))}
                        </time>
                        <span>{localize("〜")}</span>
                        <time dateTime={plan.endsAt ?? undefined}>
                          {localize(localTime(plan.endsAt))}
                        </time>
                      </div>
                      <h3>
                        {localize(
                          starredMovieKeys.has(plan.movieKey) && (
                            <StarIcon
                              size={18}
                              weight="fill"
                              aria-label={localize("気になる作品")}
                            />
                          ),
                        )}
                        {movieTitle(plan.title)}
                      </h3>
                      <p>
                        <MapPinIcon size={15} aria-hidden="true" />
                        {localize(plan.cinemaName)}
                      </p>
                      {localize(
                        (plan.screen || plan.format) && (
                          <p className="viewing-plan-meta">
                            {localize(
                              [plan.screen, plan.format]
                                .filter(Boolean)
                                .join(" / "),
                            )}
                          </p>
                        ),
                      )}
                      <div className="viewing-plan-actions">
                        <label className="viewing-plan-reservation">
                          <input
                            type="checkbox"
                            checked={plan.reservedAt !== null}
                            disabled={savingIds.has(plan.showingId)}
                            onChange={(event) =>
                              void onReservationChange(
                                plan,
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <span>{localize("予約済み")}</span>
                        </label>
                        <a
                          href={plan.bookingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {localize("公式サイト")}
                          <ArrowSquareOutIcon size={14} aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          disabled={savingIds.has(plan.showingId)}
                          onClick={() => void onRemove(plan)}
                          aria-label={localize(
                            `${movieTitle(plan.title)}を鑑賞予定から外す`,
                          )}
                        >
                          <TrashIcon size={16} aria-hidden="true" />
                          {localize(
                            savingIds.has(plan.showingId)
                              ? "保存中"
                              : "予定から外す",
                          )}
                        </button>
                      </div>
                    </article>
                  </li>
                )),
              )}
            </ol>
          </section>
        )),
      )}
    </PageShell>
  );
}
