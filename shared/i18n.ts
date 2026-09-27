import en from "./locales/en.json";
import type { Language } from "./language";
const dictionary: Record<string, string> = en;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => {
    const indices: string[] = [];
    const pattern = key
      .split(/(\{\d+\})/)
      .map((part) =>
        /^\{\d+\}$/.test(part) ? (indices.push(part), "(.+?)") : escape(part),
      )
      .join("");
    return {
      regex: new RegExp(`^${pattern}$`),
      value,
      indices,
      specificity: key.replace(/\{\d+\}/g, "").length,
    };
  })
  .sort((a, b) => b.specificity - a.specificity);
/** Pure, request-local translation. Canonical data and user-entered values stay unchanged. */
export function translate(
  text: string,
  language: Language,
  titles?: ReadonlyMap<string, string>,
  depth = 0,
): string {
  if (language === "ja" || !text) return text;
  if (titles?.has(text)) return titles.get(text)!;
  if (Object.hasOwn(dictionary, text)) return dictionary[text];
  const count = /^(\d+)(作品|上映|館)$/.exec(text);
  if (count) {
    const noun =
      count[2] === "作品"
        ? "film"
        : count[2] === "上映"
          ? "screening"
          : "cinema";
    return `${count[1]} ${noun}${count[1] === "1" ? "" : "s"}`;
  }
  const trimmed = text.trim();
  if (Object.hasOwn(dictionary, trimmed))
    return text.replace(trimmed, dictionary[trimmed]);
  if (depth < 3)
    for (const { regex, value, indices } of patterns) {
      const match = regex.exec(text);
      if (match)
        return value.replace(/\{\d+\}/g, (token) => {
          const index = indices.indexOf(token);
          return index < 0
            ? token
            : translate(match[index + 1], language, titles, depth + 1);
        });
    }
  return text;
}

export function translateScreenInfo(value: string, language: Language): string {
  return language === "ja"
    ? value
    : value
        .split(/\s*[\/／・]\s*/)
        .map((part) => translate(part, "en"))
        .join(" / ");
}
