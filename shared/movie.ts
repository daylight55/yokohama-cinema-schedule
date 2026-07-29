import type { MoviePreferenceStatus } from "./types";

const SCREENING_FORMAT_TOKEN =
  String.raw`日本語(?:\s*版|\s*(?:字幕(?:スーパー)?|吹替(?:え)?|吹き替え)(?:版)?)` +
  String.raw`|(?:字幕(?:スーパー)?|吹替(?:え)?|吹き替え)(?:版)?` +
  String.raw`|(?:ULTRA\s*)?4DX|MX4D|IMAX(?:\s*レーザー)?|SCREENX` +
  String.raw`|Dolby\s*(?:Cinema|Atmos)|D-?BOX|FLEXOUND|BESTIA` +
  String.raw`|2D|3D|4K`;
const RATING_TOKEN =
  String.raw`(?:G|PG\s*-?\s*12|R\s*-?\s*(?:15|18)\s*\+?)(?:指定)?`;
const SCREENING_METADATA_TOKEN = `(?:${SCREENING_FORMAT_TOKEN}|${RATING_TOKEN})`;
const SCREENING_METADATA_SEPARATOR =
  String.raw`(?:\s*(?:[/／・,，&＆※]|with)\s*|\s+)`;
const LEADING_SCREENING_METADATA = new RegExp(
  `^(?:${SCREENING_METADATA_TOKEN}${SCREENING_METADATA_SEPARATOR})+`,
  "i",
);
const TRAILING_SCREENING_METADATA = new RegExp(
  `(?:${SCREENING_METADATA_SEPARATOR}${SCREENING_METADATA_TOKEN})+$`,
  "i",
);
const DELIMITED_SCREENING_METADATA = new RegExp(
  `(^|[\\s)】\\]〉>])${SCREENING_METADATA_TOKEN}(?=$|[\\s/／・,，&＆※])`,
  "gi",
);
const SCREENING_FORMAT = new RegExp(SCREENING_FORMAT_TOKEN, "gi");
const RATING_ONLY = new RegExp(`^${RATING_TOKEN}$`, "i");
const BRACKETED_LABEL =
  /【([^】]*)】|\[([^\]]*)\]|\(([^)]*)\)|<([^>]*)>|〈([^〉]*)〉/g;

export function isMoviePreferenceStatus(
  value: unknown,
): value is MoviePreferenceStatus {
  return value === "watched" || value === "not_interested";
}

export function movieDisplayTitle(title: string): string {
  let result = title.normalize("NFKC").replace(/\s+/g, " ").trim();
  const normalizedTitle = result;
  result = result.replace(BRACKETED_LABEL, (label, ...captures: unknown[]) => {
    const content = captures.find(
      (capture): capture is string => typeof capture === "string",
    );
    return content && isScreeningMetadataOnly(content) ? " " : label;
  });
  const beforeDelimitedMetadata = result;
  result = result.replace(DELIMITED_SCREENING_METADATA, "$1");
  if (result !== beforeDelimitedMetadata) {
    result = result.replace(/^(?:\s*[/／・,，&＆※]\s*)+/g, "");
  }

  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result
      .replace(LEADING_SCREENING_METADATA, "")
      .replace(TRAILING_SCREENING_METADATA, "")
      .trim();
  }

  const collapsed = result.replace(/\s+/g, " ").trim();
  return (
    result === normalizedTitle
      ? collapsed
      : collapsed.replace(/(?:\s*[/／・,，&＆※]\s*)+$/g, "")
  ).trim();
}

export function moviePreferenceKey(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replaceAll("/", "")
    .replace(/[【（(].*?(?:】|）|\))/g, "")
    .replace(
      /[［\[](?:字幕|吹替|日本語版|2D|3D|IMAX|4DX|R15\+|PG-?12)[］\]]/gi,
      "",
    )
    .replace(/(?:字幕|吹替|日本語版|2D|3D|IMAX|4DX|DolbyCinema)/gi, "")
    .toLowerCase();
}

function isScreeningMetadataOnly(value: string): boolean {
  const remainder = value
    .normalize("NFKC")
    .replace(SCREENING_FORMAT, " ")
    .replace(/(?:[\s/／・,，&＆※]+|with)/gi, "")
    .trim();
  return remainder === "" || RATING_ONLY.test(remainder);
}

export function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
