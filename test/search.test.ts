import { describe, expect, it } from "vitest";
import {
  matchesShowingSearchQuery,
  normalizeSearchQuery,
  searchMatchExpression,
  showingSearchText,
} from "../shared/search";

describe("schedule full-text search", () => {
  it("normalizes full-width text and whitespace", () => {
    expect(normalizeSearchQuery("  ＴＯＨＯ   シネマズ  ")).toBe(
      "TOHO シネマズ",
    );
  });

  it("indexes Japanese titles and cinema names as searchable terms", () => {
    expect(
      showingSearchText(
        "劇場版「鬼滅の刃」無限城編",
        "TOHOシネマズ 上大岡",
        "TOHO上大岡",
      ),
    ).toContain("鬼 滅 の 刃");
    expect(
      showingSearchText(
        "劇場版「鬼滅の刃」無限城編",
        "TOHOシネマズ 上大岡",
        "TOHO上大岡",
      ),
    ).toContain("toho");
  });

  it("builds a parameter-safe FTS expression", () => {
    expect(searchMatchExpression('  ノヴェチント "  ')).toBe(
      '"ノ" AND "ヴ" AND "ェ" AND "チ" AND "ン" AND "ト"',
    );
    expect(searchMatchExpression("   ")).toBeNull();
  });

  it("matches titles and cinema names while the user is typing", () => {
    expect(
      matchesShowingSearchQuery(
        "ノヴェチ",
        "ノヴェチント",
        "シネマ・ジャック＆ベティ",
      ),
    ).toBe(true);
    expect(
      matchesShowingSearchQuery(
        "ＴＯＨＯ 上大岡",
        "映画ちいかわ 人魚の島のひみつ",
        "TOHOシネマズ 上大岡",
        "TOHO上大岡",
      ),
    ).toBe(true);
  });

  it("requires every search term to match the same showing", () => {
    expect(
      matchesShowingSearchQuery(
        "TOHO 桜木町",
        "映画ちいかわ 人魚の島のひみつ",
        "TOHOシネマズ 上大岡",
        "TOHO上大岡",
      ),
    ).toBe(false);
    expect(
      matchesShowingSearchQuery(
        "",
        "映画ちいかわ 人魚の島のひみつ",
        "TOHOシネマズ 上大岡",
      ),
    ).toBe(true);
  });
});
