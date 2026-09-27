import { SharingControls } from "./SharingControls";
import { MemberAvatar } from "./MemberProfile";
import { SharedWatchlist } from "./SharedWatchlist";
import { useEffect, useState } from "react";
import {
  CalendarDotsIcon,
  StarIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { SharedPlan, SharingResponse } from "../shared/sharing";
import { formatJstDate } from "../shared/date";
import { moviePreferenceKey } from "../shared/movie";
import { hashForAppView } from "./lib";
import {
  localize as t,
  localizedDate,
  movieTitle,
  registerTitleTranslations,
} from "./i18n";
import { PageHeader, PageShell } from "./PageLayout";

export function SharedPage({ manage = false }: { manage?: boolean }) {
  const [data, setData] = useState<SharingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [retry, setRetry] = useState(0);
  const [noteMovieKey, setNoteMovieKey] = useState("");
  const [member, setMember] = useState("");
  const [tab, setTab] = useState<"plans" | "movies">("plans");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    void fetch(
      `/api/sharing${groupId ? `?group=${encodeURIComponent(groupId)}` : ""}`,
      { signal: controller.signal },
    )
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
  }, [retry, groupId]);
  const members = new Map(data?.members.map((m) => [m.userId, m]));
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
  if (manage)
    return (
      <PageShell
        className="shared-page"
        labelledBy="groups-title"
        busy={loading}
      >
        <PageHeader
          eyebrow={t("共有")}
          title={t("グループ管理")}
          titleId="groups-title"
        />
        <a className="shared-back-link" href={hashForAppView("shared")}>
          {t("共有に戻る")}
        </a>
        {loading ? (
          <p role="status">{t("読み込み中…")}</p>
        ) : error ? (
          <p role="alert">
            {t("共有データを取得できませんでした。再読み込みしてください。")}{" "}
            <button
              className="secondary-button"
              onClick={() => setRetry((v) => v + 1)}
            >
              {t("再読み込み")}
            </button>
          </p>
        ) : (
          data && (
            <>
              <SharingControls
                key={data.groupId ?? "none"}
                data={data}
                onSelect={(id) => {
                  setMember("");
                  setGroupId(id);
                }}
                onChanged={() => setRetry((v) => v + 1)}
              />
              {!!data.members.length && (
                <section className="group-member-list">
                  <h2>{t("メンバー")}</h2>
                  <ul>
                    {data.members.map((m) => (
                      <li key={m.userId}>
                        <MemberAvatar name={m.name} url={m.avatarUrl} />
                        <span>{m.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        )}
      </PageShell>
    );
  return (
    <PageShell className="shared-page" labelledBy="shared-title" busy={loading}>
      <PageHeader
        eyebrow={t("みんなの映画")}
        title={t("共有")}
        titleId="shared-title"
      />
      {!loading && !error && data && (
        <div className="sharing-view-heading">
          {data.groups.length > 1 ? (
            <label>
              {t("共有グループ")}
              <select
                value={data.groupId ?? ""}
                onChange={(e) => {
                  setMember("");
                  setGroupId(e.target.value);
                }}
              >
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : data.groups.length === 1 ? (
            <h2>{data.groups[0].name}</h2>
          ) : (
            <p>{t("まずは一緒に映画を楽しむ相手を招待してね！")}</p>
          )}
          <a className="shared-back-link" href={hashForAppView("groups")}>
            {t("グループ管理")}
          </a>
        </div>
      )}
      {!!data?.groupId && (
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
      )}
      {member && members.has(member) && (
        <section
          className="shared-member-summary"
          aria-label={t("プロフィール")}
        >
          <MemberAvatar
            name={members.get(member)!.name}
            url={members.get(member)?.avatarUrl}
          />
          <div>
            <strong>{members.get(member)!.name}</strong>
            {members.get(member)?.bio && <p>{members.get(member)!.bio}</p>}
          </div>
        </section>
      )}
      {loading ? (
        <p role="status">{t("読み込み中…")}</p>
      ) : error ? (
        <p role="alert">
          {t("共有データを取得できませんでした。再読み込みしてください。")}
        </p>
      ) : !data?.groupId ? null : tab === "plans" ? (
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
                              <MemberAvatar
                                name={members.get(p.userId)?.name ?? ""}
                                url={members.get(p.userId)?.avatarUrl}
                              />
                              <span title={members.get(p.userId)?.bio}>
                                {members.get(p.userId)?.name}
                              </span>
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
        <SharedWatchlist
          data={data!}
          member={member}
          autoEditKey={noteMovieKey}
          onChanged={(key) => {
            setNoteMovieKey(key);
            setRetry((v) => v + 1);
          }}
        />
      )}
    </PageShell>
  );
}
