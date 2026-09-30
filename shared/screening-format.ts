export interface ScreeningLanguageLabel {
  kind: "subtitled" | "dubbed";
  label: "字幕" | "日本語字幕" | "吹替" | "日本語吹替";
}

// Only explicit screening metadata is evidence of a language version.
// A Japanese film title or "日本語版" alone does not imply dubbing.
export function splitScreeningFormat(format: string | null | undefined) {
  const labels: ScreeningLanguageLabel[] = [];
  const rest = (format ?? "").normalize("NFKC").replace(
    /(?:日本語\s*)?(?:字幕(?:スーパー)?(?:付(?:き)?|版)?|吹(?:き)?替(?:え)?(?:版)?)|\b(?:subtitled|subtitles|sub|dubbed|dub)\b/gi,
    token => {
      const kind = /字幕|\bsub/i.test(token) ? "subtitled" : "dubbed";
      const japanese = token.startsWith("日本語");
      const label = kind === "subtitled" ? japanese ? "日本語字幕" : "字幕" : japanese ? "日本語吹替" : "吹替";
      const existing = labels.find(item => item.kind === kind);
      if (!existing) labels.push({kind, label});
      else if (japanese) existing.label = label;
      return "";
    },
  );
  const detail = labels.length ? rest.replace(/\(\s*\)|\[\s*\]|【\s*】/g, "")
    .split(/\s*[/／・,，|]\s*/).map(part => part.trim()).filter(Boolean).join(" / ") : (format ?? "");
  return { labels, detail };
}
