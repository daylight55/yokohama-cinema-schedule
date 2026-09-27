import { moviePreferenceKey } from "../shared/movie";
import { useEffect, useSyncExternalStore } from "react";
import {
  languageFromCookie,
  isLanguage,
  type Language,
} from "../shared/language";
import { translate, translateScreenInfo } from "../shared/i18n";
let language: Language =
  typeof document === "undefined"
    ? "ja"
    : (languageFromCookie(document.cookie) ??
      (navigator.language.toLowerCase().startsWith("en") ? "en" : "ja"));
let revision = 0;
let userRole: "admin" | "member" | null = null;
const listeners = new Set<() => void>();
const titles = new Map<string, string>();
function publish() {
  for (const notify of listeners) notify();
}
function applyLanguage(value: Language) {
  language = value;
  document.documentElement.lang = value;
  document.title =
    value === "en"
      ? "Hama Movie! - Yokohama Cinema Showtimes"
      : "はまむび！｜横浜の映画スケジュール";
  document.cookie = `hamamubi_language=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  publish();
}
export function useLanguage() {
  const value = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => language,
  );
  useEffect(() => {
    applyLanguage(language);
    const controller = new AbortController();
    const started = revision;
    void fetch("/api/account/language", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("language_load_failed");
        const data = (await response.json()) as {
          language: unknown;
          userRole?: unknown;
        };
        userRole =
          data.userRole === "admin"
            ? "admin"
            : data.userRole === "member"
              ? "member"
              : null;
        publish();
        if (isLanguage(data.language) && started === revision)
          applyLanguage(data.language);
      })
      .catch(() => {
        /* Keep the current language when offline. */
      });
    return () => controller.abort();
  }, []);
  return value;
}
export async function saveLanguage(value: Language) {
  revision += 1;
  const response = await fetch("/api/account/language", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language: value }),
  });
  if (!response.ok) throw new Error("言語設定を保存できませんでした。");
  applyLanguage(value);
}
export function localeCode() {
  return language === "en" ? "en-GB" : "ja-JP";
}
export function registerTitleTranslations(
  records: Array<{ japaneseTitle: string; englishTitle: string | null }>,
) {
  for (const row of records)
    if (row.englishTitle)
      titles.set(moviePreferenceKey(row.japaneseTitle), row.englishTitle);
}
export function localize<T>(value: T): T {
  if (typeof value === "string") return translate(value, language) as T;
  if (Array.isArray(value)) return value.map(localize) as T;
  return value;
}
export function localizedDate(options: Intl.DateTimeFormatOptions) {
  return {
    format: (value: Date | number) =>
      new Intl.DateTimeFormat(localeCode(), {
        timeZone: "Asia/Tokyo",
        ...options,
      }).format(value),
  };
}

export function englishText(value: string) {
  return titles.get(moviePreferenceKey(value)) ?? translate(value, "en");
}

export function movieTitle(value: string) {
  return language === "en"
    ? (titles.get(moviePreferenceKey(value)) ?? value)
    : value;
}

export function useUserRole() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => userRole,
  );
}

export function screeningInfo(value: string) {
  return translateScreenInfo(value, language);
}
