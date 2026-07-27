import type { MoviePreferenceStatus } from "./types";

export function isMoviePreferenceStatus(
  value: unknown,
): value is MoviePreferenceStatus {
  return value === "watched" || value === "not_interested";
}

export function moviePreferenceKey(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[【（(].*?(?:】|）|\))/g, "")
    .replace(
      /[［\[](?:字幕|吹替|日本語版|2D|3D|IMAX|4DX|R15\+|PG-?12)[］\]]/gi,
      "",
    )
    .replace(/(?:字幕|吹替|日本語版|2D|3D|IMAX|4DX|DolbyCinema)/gi, "")
    .toLowerCase();
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
