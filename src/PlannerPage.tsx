import {
  ArrowSquareOutIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
  StarIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, todayInJst } from "../shared/date";
import type {
  CalendarAvailabilityResponse,
  MovieMarathonPlan,
  MovieMarathonPlannerResponse,
  MovieMarathonProposal,
} from "../shared/types";
import { PageHeader, PageShell } from "./PageLayout";

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

function localTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

function formatPlanDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00+09:00`));
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return new Error(payload?.error ?? fallback);
}

export function PlannerPage({
  selectedDate,
  onSelectedDateChange,
}: {
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
}) {
  const today = todayInJst();
  const maxDate = addDays(today, 365);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("23:00");
  const [data, setData] = useState<MovieMarathonPlannerResponse | null>(
    null,
  );
  const [proposal, setProposal] = useState<MovieMarathonProposal | null>(
    null,
  );
  const [state, setState] = useState<
    "loading" | "idle" | "generating" | "saving" | "calendar"
  >("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch(
        `/api/planner?date=${encodeURIComponent(selectedDate)}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) throw await readError(response, "読み込めませんでした");
      setData((await response.json()) as MovieMarathonPlannerResponse);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "映画はしごを読み込めませんでした",
      );
    } finally {
      setState("idle");
    }
  }, [selectedDate]);

  useEffect(() => {
    setProposal(null);
    setNotice(null);
    void load();
  }, [load]);

  const savedForSelectedDate = useMemo(
    () =>
      (data?.savedPlans ?? []).filter(
        (plan) => plan.planDate === selectedDate,
      ),
    [data?.savedPlans, selectedDate],
  );

  const postPlanner = async (
    action: "generate" | "save",
  ): Promise<MovieMarathonProposal | MovieMarathonPlan> => {
    const response = await fetch("/api/planner", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action,
        date: selectedDate,
        startTime,
        endTime,
      }),
    });
    if (!response.ok) {
      throw await readError(response, "映画はしごを作成できませんでした");
    }
    return response.json() as Promise<
      MovieMarathonProposal | MovieMarathonPlan
    >;
  };

  const generate = async () => {
    setState("generating");
    setError(null);
    setNotice(null);
    try {
      const next = (await postPlanner(
        "generate",
      )) as MovieMarathonProposal;
      setProposal(next);
      if (next.items.length === 0) {
        setNotice(
          data?.schedulePublished
            ? "この空き時間内で、移動に間に合う組み合わせが見つかりませんでした。"
            : "この日の上映スケジュールはまだ公開されていません。日付だけ先に保存できます。",
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "提案を作成できませんでした",
      );
    } finally {
      setState("idle");
    }
  };

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const plan = (await postPlanner("save")) as MovieMarathonPlan;
      setNotice(
        plan.status === "planned"
          ? "映画はしごを保存しました。"
          : "日付と空き時間を保存しました。上映公開後にもう一度提案できます。",
      );
      setProposal(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "保存できませんでした",
      );
      setState("idle");
    }
  };

  const useGoogleAvailability = async () => {
    setState("calendar");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/calendar/availability?date=${encodeURIComponent(selectedDate)}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw await readError(response, "空き時間を取得できませんでした");
      }
      const availability =
        (await response.json()) as CalendarAvailabilityResponse;
      if (!availability.suggestedStart || !availability.suggestedEnd) {
        setNotice("90分以上の空き時間が見つかりませんでした。");
        return;
      }
      setStartTime(localTime(availability.suggestedStart));
      setEndTime(localTime(availability.suggestedEnd));
      setProposal(null);
      setNotice("Google カレンダーで最も長い空き時間を反映しました。");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Google カレンダーを確認できませんでした",
      );
    } finally {
      setState("idle");
    }
  };

  const deletePlan = async (plan: MovieMarathonPlan) => {
    const calendarNote = plan.googleCalendarEventId
      ? " Google カレンダーの予定も削除されます。"
      : "";
    if (
      !window.confirm(
        `${formatPlanDate(plan.planDate)}の予定を削除しますか？${calendarNote}`,
      )
    ) {
      return;
    }
    const response = await fetch(
      `/api/planner?id=${encodeURIComponent(plan.id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setError("予定を削除できませんでした");
      return;
    }
    setNotice("予定を削除しました。");
    await load();
  };

  const syncCalendar = async (plan: MovieMarathonPlan) => {
    setState("calendar");
    setError(null);
    try {
      const response = await fetch("/api/calendar/export", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ planId: plan.id }),
      });
      if (!response.ok) {
        throw await readError(response, "カレンダーへ追加できませんでした");
      }
      const result = (await response.json()) as {
        alreadySynced?: boolean;
        htmlLink?: string | null;
      };
      setNotice(
        result.alreadySynced
          ? "この予定はGoogle カレンダーに追加済みです。"
          : "Google カレンダーに追加しました。",
      );
      if (result.htmlLink) {
        window.open(result.htmlLink, "_blank", "noopener,noreferrer");
      }
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Google カレンダーへ追加できませんでした",
      );
      setState("idle");
    }
  };

  const busy = state !== "idle";

  return (
    <PageShell className="planner-page" busy={busy}>
      <PageHeader
        eyebrow="1年先まで予定を記録"
        title="映画はしごガチャ"
        meta={<span className="page-badge favorite">気になる作品を優先</span>}
      />

      <form
        className="planner-form"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label>
          <span>空いている日</span>
          <input
            name="date"
            type="date"
            min={today}
            max={maxDate}
            value={selectedDate}
            onChange={(event) =>
              onSelectedDateChange(event.currentTarget.value)
            }
          />
        </label>
        <div className="planner-time-fields">
          <label>
            <span>開始</span>
            <input
              name="startTime"
              type="time"
              value={startTime}
              enterKeyHint="next"
              onChange={(event) => {
                setStartTime(event.currentTarget.value);
                setProposal(null);
              }}
            />
          </label>
          <span aria-hidden="true">〜</span>
          <label>
            <span>終了</span>
            <input
              name="endTime"
              type="time"
              value={endTime}
              enterKeyHint="done"
              onChange={(event) => {
                setEndTime(event.currentTarget.value);
                setProposal(null);
              }}
            />
          </label>
        </div>

        {data?.calendar.connected ? (
          <div className="calendar-connection connected">
            <div>
              <CheckCircleIcon size={19} weight="fill" aria-hidden="true" />
              <span>
                <strong>Google カレンダー連携中</strong>
                <small>{data.calendar.email}</small>
              </span>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void useGoogleAvailability()}
            >
              空き時間を反映
            </button>
          </div>
        ) : data?.calendar.configured ? (
          <a className="google-connect-button" href="/auth/google/start">
            <CalendarCheckIcon size={20} aria-hidden="true" />
            Google カレンダーと連携
          </a>
        ) : (
          <p className="calendar-setup-note">
            Google カレンダー連携はOAuth設定後に利用できます。
          </p>
        )}

        <button
          type="submit"
          className="planner-primary-button"
          disabled={busy}
        >
          {state === "generating" ? "組み合わせ中…" : "理想のはしごを提案"}
        </button>
      </form>

      {error && (
        <p className="planner-message error" role="alert">
          <WarningCircleIcon size={18} aria-hidden="true" />
          {error}
        </p>
      )}
      {notice && (
        <p className="planner-message" role="status">
          {notice}
        </p>
      )}

      {state === "loading" && (
        <div className="planner-loading" role="status">
          予定を読み込んでいます…
        </div>
      )}

      {data && !data.schedulePublished && state !== "loading" && (
        <div className="planner-unpublished">
          <CalendarCheckIcon size={24} aria-hidden="true" />
          <div>
            <strong>上映スケジュールはまだ未公開です</strong>
            <p>
              日付と空き時間だけ先に保存して、公開後に提案を作り直せます。
            </p>
          </div>
        </div>
      )}

      {proposal && proposal.items.length > 0 && (
        <section className="planner-proposal" aria-labelledby="proposal-title">
          <div className="planner-section-heading">
            <div>
              <p>おすすめ</p>
              <h2 id="proposal-title">
                {proposal.movieCount}本の映画はしご
              </h2>
            </div>
            <span>
              ★ {proposal.starredCount} / 移動{" "}
              {proposal.totalTransferMinutes}分
            </span>
          </div>
          <PlanTimeline items={proposal.items} />
          <button
            type="button"
            className="planner-primary-button"
            disabled={busy}
            onClick={() => void save()}
          >
            {state === "saving" ? "保存中…" : "このプランを保存"}
          </button>
        </section>
      )}

      {!proposal && data && !data.schedulePublished && (
        <button
          type="button"
          className="planner-save-date-button"
          disabled={busy}
          onClick={() => void save()}
        >
          この日と空き時間を保存
        </button>
      )}

      {savedForSelectedDate.length > 0 && (
        <section className="saved-plans" aria-labelledby="saved-plans-title">
          <div className="planner-section-heading">
            <div>
              <p>{formatPlanDate(selectedDate)}</p>
              <h2 id="saved-plans-title">保存した予定</h2>
            </div>
          </div>
          {savedForSelectedDate.map((plan) => (
            <article className="saved-plan" key={plan.id}>
              <div className="saved-plan-heading">
                <div>
                  <strong>
                    {plan.status === "planned"
                      ? `${plan.items.length}本の映画はしご`
                      : "日付・空き時間を記録"}
                  </strong>
                  <span>
                    {localTime(plan.availableStart)}〜
                    {localTime(plan.availableEnd)}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="この予定を削除"
                  onClick={() => void deletePlan(plan)}
                >
                  <TrashIcon size={18} aria-hidden="true" />
                </button>
              </div>
              {plan.items.length > 0 && <PlanTimeline items={plan.items} />}
              {plan.items.length > 0 &&
                data?.calendar.connected &&
                (plan.googleCalendarEventId ? (
                  <p className="calendar-synced">
                    <CheckCircleIcon
                      size={17}
                      weight="fill"
                      aria-hidden="true"
                    />
                    Google カレンダーに追加済み
                  </p>
                ) : (
                  <button
                    type="button"
                    className="secondary-button calendar-export-button"
                    disabled={busy}
                    onClick={() => void syncCalendar(plan)}
                  >
                    <CalendarCheckIcon size={18} aria-hidden="true" />
                    Google カレンダーに追加
                  </button>
                ))}
            </article>
          ))}
        </section>
      )}

      {data?.calendar.connected && (
        <form method="post" action="/auth/google/disconnect">
          <button className="calendar-disconnect" type="submit">
            Google カレンダー連携を解除
          </button>
        </form>
      )}
    </PageShell>
  );
}

function PlanTimeline({
  items,
}: {
  items: MovieMarathonProposal["items"];
}) {
  return (
    <ol className="plan-timeline">
      {items.map((item, index) => (
        <li key={`${item.showingId}-${item.sequence}`}>
          <div className="plan-transfer">
            <span>{index === 0 ? "自宅から" : "移動"}</span>
            <strong>約{item.transferMinutes}分</strong>
          </div>
          <article>
            <div className="plan-time">
              <ClockIcon size={16} aria-hidden="true" />
              <time dateTime={item.startsAt}>
                {localTime(item.startsAt)}
              </time>
              <span>〜</span>
              <time dateTime={item.endsAt}>{localTime(item.endsAt)}</time>
            </div>
            <h3>
              {item.starred && (
                <StarIcon
                  size={18}
                  weight="fill"
                  aria-label="気になる作品"
                />
              )}
              {item.title}
            </h3>
            <p>
              <MapPinIcon size={15} aria-hidden="true" />
              {item.cinemaName}
            </p>
            <a href={item.bookingUrl} target="_blank" rel="noreferrer">
              公式サイト
              <ArrowSquareOutIcon size={14} aria-hidden="true" />
            </a>
          </article>
        </li>
      ))}
    </ol>
  );
}
