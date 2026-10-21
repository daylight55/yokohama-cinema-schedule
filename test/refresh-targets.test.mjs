import { describe, expect, it } from "vitest";
import {
  parseRefreshTargets,
  selectRefreshSources,
} from "../scripts/lib/refresh-targets.mjs";

describe("operator re-collection scope", () => {
  const now = Date.parse("2026-10-20T20:00:00Z"); // Oct 21 JST
  it("requires explicit cinema IDs and a valid current collection date", () => {
    for (const args of [
      [],
      ["2026-10-21"],
      ["2026-10-20", "--source", "a"],
      ["2026-10-28", "--source", "a"],
      ["2026-10-21", "--source", ""],
      ["2026-10-21", "--source", "a", "extra"],
    ]) {
      expect(() => parseRefreshTargets(args, now)).toThrow();
    }
    expect(
      parseRefreshTargets(
        [
          "2026-10-21",
          "--source",
          "tjoy-yokohama",
          "--source",
          "yokohama-burg13",
          "--source",
          "tjoy-yokohama",
        ],
        now,
      ),
    ).toEqual({
      date: "2026-10-21",
      ids: ["tjoy-yokohama", "yokohama-burg13"],
    });
  });
  it("selects only the failing cinemas and rejects any unknown ID before writing", () => {
    const all = [
      { id: "toho-kamiooka", batch: 0 },
      { id: "tjoy-yokohama", batch: 0 },
      { id: "yokohama-burg13", batch: 0 },
    ];
    expect(
      selectRefreshSources(all, ["tjoy-yokohama", "yokohama-burg13"]),
    ).toEqual(all.slice(1));
    expect(() => selectRefreshSources(all, ["tjoy-yokohama", "typo"])).toThrow(
      "Unknown cinema: typo",
    );
  });
});
