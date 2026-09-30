import type { Language } from "../shared/language";
import { translate } from "../shared/i18n";
import { splitScreeningFormat } from "../shared/screening-format";

export function screeningLanguageSuffix(format: string | null | undefined, t: (value: string) => string) {
  const labels = splitScreeningFormat(format).labels.map(item => t(item.label)).join(" / ");
  return labels ? ` · ${labels}` : "";
}

export function ScreeningFormat({ format, language = "ja" }: { format?: string | null; language?: Language }) {
  const { labels } = splitScreeningFormat(format);
  if (!labels.length) return null;
  return <span className="screening-format-badges">
    {labels.map(item => <span className={`screening-language ${item.kind}`} key={item.label}>{translate(item.label, language)}</span>)}
  </span>;
}
