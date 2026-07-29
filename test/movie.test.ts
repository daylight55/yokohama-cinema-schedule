import { describe, expect, it } from "vitest";
import {
  isMoviePreferenceStatus,
  movieDisplayTitle,
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

  it("uses the same key across bilingual title separators", () => {
    const expectedKey = moviePreferenceKey("Michael/マイケル");

    expect(moviePreferenceKey("Michael／マイケル（字幕）")).toBe(expectedKey);
    expect(moviePreferenceKey("Michael マイケル")).toBe(expectedKey);
  });

  it.each([
    ["４ＤＸ　キングダム　魂の決戦（字幕）（ＰＧ１２）", "キングダム 魂の決戦"],
    ["【ＩＭＡＸ／日本語字幕版】 テスト映画 [PG-12]", "テスト映画"],
    ["テスト映画（吹替え版）", "テスト映画"],
    ["テスト映画〈Dolby Cinema・R15＋〉", "テスト映画"],
    ["SCREENX / 字幕 テスト映画", "テスト映画"],
    ["テスト映画 3D / 吹替", "テスト映画"],
    [
      "【SCREENX with DolbyAtmos・字幕】Michael／マイケル",
      "Michael/マイケル",
    ],
    [
      "ザ・スーパーマリオギャラクシー・ムービー(日本語版※日本語吹替版)",
      "ザ・スーパーマリオギャラクシー・ムービー",
    ],
    [
      "映画館デビュー）吹替 パウ・パトロール ザ・ダイノ・ムービー",
      "映画館デビュー) パウ・パトロール ザ・ダイノ・ムービー",
    ],
  ])("removes screening metadata from display titles", (title, expected) => {
    expect(movieDisplayTitle(title)).toBe(expected);
  });

  it("keeps meaningful title qualifiers", () => {
    expect(movieDisplayTitle("白夜　４Ｋレストア")).toBe("白夜 4Kレストア");
    expect(movieDisplayTitle("ぐるりのこと。〈4Kリマスター版〉")).toBe(
      "ぐるりのこと。〈4Kリマスター版〉",
    );
    expect(movieDisplayTitle("作品名（前編）")).toBe("作品名(前編)");
    expect(movieDisplayTitle("3D彼女 リアルガール")).toBe(
      "3D彼女 リアルガール",
    );
    expect(movieDisplayTitle("&TEAM VR CONCERT : BOUNDLESS")).toBe(
      "&TEAM VR CONCERT : BOUNDLESS",
    );
  });

  it("only accepts HTTPS image URLs", () => {
    expect(safeImageUrl("https://example.com/poster.jpg")).toBe(
      "https://example.com/poster.jpg",
    );
    expect(safeImageUrl("http://example.com/poster.jpg")).toBeNull();
  });
});
