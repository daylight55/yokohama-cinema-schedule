import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BellIcon } from "@phosphor-icons/react";
import type {
  NotificationsResponse,
  GroupActivity,
} from "../shared/notifications";
import { PageHeader, PageShell } from "./PageLayout";
import { MemberAvatar } from "./MemberProfile";
import {
  localize as t,
  movieTitle,
  localizedDate,
  registerTitleTranslations,
} from "./i18n";
import { hashForAppView } from "./lib";
import { notificationPollDelay } from "../shared/notifications";
import { supportsBrowserNotifications } from "./notification-support";

const NotificationContext = createContext<{
  data: NotificationsResponse | null;
  error: boolean;
  refresh: () => void;
}>({ data: null, error: false, refresh: () => {} });
const enabledKey = (id: string) => `hama-notifications:${id}`;
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    /* In-app notifications still work without storage. */
    return false;
  }
}
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState(false);
  const refreshRef = useRef(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      busy = false,
      failures = 0,
      lastFetch = 0;
    let userId = "",
      latest: number | null = null,
      unavailable = false;
    const schedule = () => {
      clearTimeout(timer);
      const delay = notificationPollDelay(
        failures,
        document.hidden,
        stored(enabledKey(userId)) === "on",
      );
      if (delay !== null && !unavailable)
        timer = setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      lastFetch = Date.now();
      try {
        const response = await fetch("/api/notifications?summary=1", {
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          unavailable = true;
          setData(null);
          return;
        }
        if (!response.ok) throw new Error("notifications_failed");
        const next: NotificationsResponse = await response.json();
        if (controller.signal.aborted) return;
        if (userId !== next.userId) latest = null;
        userId = next.userId;
        if (
          latest !== null &&
          next.latestId > latest &&
          next.unread > 0 &&
          next.latestId > next.lastReadId &&
          stored(enabledKey(userId)) === "on" &&
          supportsBrowserNotifications() &&
          Notification.permission === "granted" &&
          !location.hash.startsWith("#notifications") &&
          next.latestId > Number(stored(`${enabledKey(userId)}:last`) ?? 0)
        ) {
          save(`${enabledKey(userId)}:last`, String(next.latestId));
          // No private film notes on the lock screen. Open the authenticated feed to read them.
          const registration =
            await navigator.serviceWorker.getRegistration("/");
          if (
            registration &&
            typeof registration.showNotification === "function"
          )
            await registration
              .showNotification("Hama Movie!", {
                body: t("グループに新着情報があるよ！"),
                tag: "hama-group-updates",
                icon: "/brand/hamamubi-icon-v2-192.png",
              })
              .catch(() => {});
        }
        latest = next.latestId;
        setData((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
        setError(false);
        failures = 0;
      } catch {
        if (!controller.signal.aborted) {
          failures++;
          setError(true);
        }
      } finally {
        busy = false;
        if (!controller.signal.aborted) schedule();
      }
    };
    refreshRef.current = () => {
      failures = 0;
      unavailable = false;
      void poll();
    };
    const visible = () => {
      if (
        !document.hidden &&
        !unavailable &&
        failures < 5 &&
        Date.now() - lastFetch >= 30000
      )
        void poll();
      else schedule();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    window.addEventListener("sharing-changed", refreshRef.current);
    window.addEventListener("notification-setting-changed", visible);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("sharing-changed", refreshRef.current);
      window.removeEventListener("notification-setting-changed", visible);
    };
  }, []);
  return (
    <NotificationContext
      value={{ data, error, refresh: () => refreshRef.current() }}
    >
      {children}
    </NotificationContext>
  );
}
export function NotificationBell() {
  const { data } = useContext(NotificationContext);
  if (!data) return null;
  return (
    <a
      className="icon-button notification-bell"
      href={hashForAppView("notifications")}
      aria-label={`${t("新着情報")}${data.unread ? ` · ${t("未読")} ${data.unread}` : ""}`}
    >
      <BellIcon size={20} aria-hidden="true" />
      {data.unread > 0 && (
        <span className="notification-dot" aria-hidden="true" />
      )}
    </a>
  );
}
function BrowserNotificationSetting({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(
    stored(enabledKey(userId)) === "on" &&
      supportsBrowserNotifications() &&
      Notification.permission === "granted",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!supportsBrowserNotifications())
    return <p>{t("このブラウザでは新着一覧で確認してね。")}</p>;
  return (
    <div className="browser-notification-setting">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            setError("");
            try {
              if (next) {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") throw new Error("permission");
                const registration = await navigator.serviceWorker.register(
                  "/notifications-sw.js",
                  { scope: "/" },
                );
                if (!registration.active)
                  await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((_, reject) =>
                      setTimeout(
                        () => reject(new Error("registration")),
                        10000,
                      ),
                    ),
                  ]);
              }
              if (!save(enabledKey(userId), next ? "on" : "off"))
                throw new Error("storage");
              setEnabled(next);
              window.dispatchEvent(new Event("notification-setting-changed"));
            } catch {
              setError(
                Notification.permission === "denied"
                  ? "通知がブロックされています。ブラウザのサイト設定で変更できます。"
                  : "ブラウザ通知を有効にできませんでした。",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>{t("この端末でブラウザ通知")}</span>
      </label>
      <p>{t("サイトを開いている間の新着を通知するよ。")}</p>
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
export function NotificationsPage() {
  const {
    data: summary,
    error: pollError,
    refresh,
  } = useContext(NotificationContext);
  const [feed, setFeed] = useState<NotificationsResponse | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = summary?.latestId,
    unread = summary?.unread;
  useEffect(() => {
    const abort = new AbortController();
    setError(false);
    void fetch("/api/notifications", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value: NotificationsResponse = await response.json();
        if (!abort.signal.aborted) {
          registerTitleTranslations(value.titles);
          setFeed(value);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [latest, unread, attempt]);
  const date = localizedDate({
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const label = (item: GroupActivity) =>
    t(
      item.kind === "watched"
        ? "鑑賞したよ"
        : item.kind === "comment"
          ? "ひとことを更新したよ"
          : "気になっているよ",
    );
  return (
    <PageShell className="notifications-page" labelledBy="notifications-title">
      <PageHeader
        eyebrow={t("みんなの映画")}
        title={t("新着情報")}
        titleId="notifications-title"
      />
      {feed && (
        <details className="notification-settings">
          <summary>{t("通知設定")}</summary>
          <BrowserNotificationSetting key={feed.userId} userId={feed.userId} />
        </details>
      )}
      {(error || pollError) && (
        <p role="alert">
          {t("新着情報を取得できませんでした。")}{" "}
          <button
            className="secondary-button"
            onClick={() => {
              setAttempt((v) => v + 1);
              refresh();
            }}
          >
            {t("再読み込み")}
          </button>
        </p>
      )}
      {!feed && !error && <p role="status">{t("読み込み中…")}</p>}
      {feed && (
        <>
          {feed.unread > 0 && (
            <button
              className="secondary-button notification-read"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(false);
                try {
                  const response = await fetch("/api/notifications", {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ through: feed.latestId }),
                  });
                  if (!response.ok) throw new Error();
                  refresh();
                  setAttempt((v) => v + 1);
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("すべて既読にする")}
            </button>
          )}
          {!feed.items.length && (
            <p>{t("メンバーの気になる・鑑賞した作品がここに届くよ！")}</p>
          )}
          <ol className="notification-feed">
            {feed.items.map((item) => (
              <li
                key={item.id}
                className={item.id > feed.lastReadId ? "is-unread" : ""}
              >
                <MemberAvatar name={item.name} url={item.avatarUrl} />
                <div>
                  <p className="notification-person">
                    <strong>{item.name}</strong>
                    <span>{label(item)}</span>
                    {item.id > feed.lastReadId && (
                      <span className="notification-unread">{t("未読")}</span>
                    )}
                  </p>
                  <a
                    className="shared-film-title"
                    href={hashForAppView("movie", { movie: item.movieKey })}
                  >
                    {movieTitle(item.title)}
                  </a>
                  {item.comment && (
                    <p className="notification-comment">{item.comment}</p>
                  )}
                  <p className="notification-meta">
                    <span>{item.groupName}</span>
                    <time dateTime={item.createdAt}>
                      {date.format(new Date(item.createdAt))}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {feed.nextBefore && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(false);
                try {
                  const response = await fetch(
                    `/api/notifications?before=${feed.nextBefore}`,
                  );
                  if (!response.ok) throw new Error();
                  const next: NotificationsResponse = await response.json();
                  setFeed((previous) =>
                    previous
                      ? {
                          ...next,
                          items: [
                            ...previous.items,
                            ...next.items.filter(
                              (item) =>
                                !previous.items.some((p) => p.id === item.id),
                            ),
                          ],
                        }
                      : next,
                  );
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("以前の新着を見る")}
            </button>
          )}
        </>
      )}
    </PageShell>
  );
}
