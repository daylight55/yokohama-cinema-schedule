import { describe, expect, it } from "vitest";
import {
  isMoviePreferenceStatus,
  moviePreferenceKey,
  safeImageUrl,
} from "../shared/movie";

describe("movie preferences", () => {
  it("accepts only supported movie statuses", () => {
    expect(isMoviePreferenceStatus("watched")).toBe(true);
    expect(isMoviePreferenceStatus("not_interested")).toBe(true);
    expect(isMoviePreferenceStatus(null)).toBe(false);
    expect(isMoviePreferenceStatus("starred")).toBe(false);
  });

  it("uses the same key across screening formats", () => {
    expect(moviePreferenceKey("【IMAX 字幕】 テスト 映画")).toBe(
      moviePreferenceKey("テスト映画（2D）"),
    );
    expect(moviePreferenceKey("テスト映画[吹替]")).toBe(
      moviePreferenceKey("テスト映画"),
    );
  });

  it("only accepts HTTPS image URLs", () => {
    expect(safeImageUrl("https://example.com/poster.jpg")).toBe(
      "https://example.com/poster.jpg",
    );
    expect(safeImageUrl("http://example.com/poster.jpg")).toBeNull();
  });
});
