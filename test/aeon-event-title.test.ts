import { expect, it } from "vitest";
import { collectedMovieTitle } from "../shared/movie-title-corrections";
import { parseAeonSchedule } from "../worker/src/parsers/aeon";
it("keeps the reviewed Aeon event label without treating it as another movie", () => {
  const rows = parseAeonSchedule({ "20261002": { screen: [{
    id: "abcdefabcdefabcdefabcdef", name: { ja: "舞台挨拶中継付き）時給三〇〇円の死神" },
    startDate: "2026-10-02T04:00:00Z", endDate: "2026-10-02T06:00:00Z",
    superEvent: { workPerformed: { identifier: "1014719" } },
  }] } }, new Set(["2026-10-02"]));
  expect(rows[0].format).toBe("舞台挨拶中継付き");
  expect(collectedMovieTitle(rows[0].title, "aeon-minatomirai", rows[0].movieKey)).toBe("時給三〇〇円の死神");
  expect(collectedMovieTitle(rows[0].title, "aeon-minatomirai", "another-id")).not.toBe("時給三〇〇円の死神");
});
