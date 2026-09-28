/** Format gate, not proof of an official release name or of translation quality. */
export function isEnglishMovieTitle(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const title = value.normalize("NFKC").trim();
  return (
    title.length > 0 &&
    title.length <= 300 &&
    /[A-Za-z0-9]/.test(title) &&
    !/[\p{Cc}\p{Cf}]/u.test(title) &&
    !/[<>]/.test(title) &&
    !/^(unknown|untitled|n\/?a|null|none|undefined|translation unavailable)$/i.test(
      title,
    ) &&
    [...title].every(
      (char) => !/\p{L}/u.test(char) || /\p{Script=Latin}/u.test(char),
    )
  );
}

/** Catch common silent truncations; semantic accuracy still needs source/review. */
export function isCompleteTitleTranslation(
  original: string,
  value: unknown,
): value is string {
  if (!isEnglishMovieTitle(value)) return false;
  const source = original.normalize("NFKC");
  const numbers: string[] = value.normalize("NFKC").match(/\d+/g) ?? [];
  if (!(source.match(/\d+/g) ?? []).every((number) => numbers.includes(number)))
    return false;
  if (/日本語字幕付/.test(source) && !/Japanese\s+subtitles/i.test(value))
    return false;
  return true;
}
