export type Language = "ja" | "en";
export function isLanguage(value: unknown): value is Language {
  return value === "ja" || value === "en";
}
export function requestLanguage(request: Request): Language {
  const value = new URL(request.url).searchParams.get("lang");
  if (isLanguage(value)) return value;
  const cookie = languageFromCookie(request.headers.get("cookie") ?? "");
  if (cookie) return cookie;
  return request.headers.get("accept-language")?.toLowerCase().startsWith("en")
    ? "en"
    : "ja";
}
export function languageCookie(language: Language): string {
  return `hamamubi_language=${language}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

export function languageFromCookie(cookie: string): Language | null {
  const value = cookie.match(/(?:^|;\s*)hamamubi_language=(ja|en)(?:;|$)/)?.[1];
  return isLanguage(value) ? value : null;
}
