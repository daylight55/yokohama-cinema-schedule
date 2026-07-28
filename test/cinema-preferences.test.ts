import { describe, expect, it } from "vitest";
import { normalizeCinemaNote } from "../functions/_lib/cinema-travel-preferences";

describe("cinema notes", () => {
  it("trims a seat note before saving", () => {
    expect(normalizeCinemaNote("  シアター3はG列中央が見やすい  ")).toBe(
      "シアター3はG列中央が見やすい",
    );
  });

  it("allows clearing a note and rejects invalid or oversized values", () => {
    expect(normalizeCinemaNote("   ")).toBe("");
    expect(normalizeCinemaNote(null)).toBeNull();
    expect(normalizeCinemaNote("あ".repeat(2001))).toBeNull();
  });
});
