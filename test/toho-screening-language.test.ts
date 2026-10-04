import { expect, it } from "vitest";
import { parseTohoSchedule } from "../worker/src/parsers/toho";

function parse(movies: Array<Record<string, unknown>>) {
  return parseTohoSchedule({ status: "0", data: [{ list: [{ code: "066", list: movies }] }] },
    "2026-10-05", "toho-kamiooka", "toho-kamiooka",
    "https://hlo.tohotheater.jp/net/schedule/066/TNPI2000J01.do");
}
function movie(code: string, ename: string, name = "同じ作品", icons = {}) {
  return { code, name, ename, list: [{ code: "01", theaterCd: "0661", name: "スクリーン1",
    ...icons, list: [{ code: 1, showingStart: "10:00", showingEnd: "12:00" }] }] };
}

it("keeps SUB and DUB attached to their own schedule version even with identical Japanese titles", () => {
  const rows = parse([movie("028671", "DISCLOSURE DAY / SUB"), movie("028672", "DISCLOSURE DAY / DUB")]);
  expect(rows.map(row => [row.movieKey, row.title, row.format])).toEqual([
    ["028671", "同じ作品", "字幕"], ["028672", "同じ作品", "吹替"],
  ]);
});
it("preserves equipment and explicit Japanese language metadata", () => {
  expect(parse([movie("1", "FILM / DUB", "作品（字幕版）", { iconNm2: "IMAX" })])[0].format).toBe("字幕 / IMAX");
  expect(parse([movie("1", "FILM", "作品", { iconNm1: "日本語吹替", iconNm2: "3D" })])[0].format).toBe("日本語吹替 / 3D");
});
it("normalizes official suffixes and never infers a language from a title word or missing metadata", () => {
  expect(parse([movie("1", "FILM ／ ｓｕｂ ")])[0].format).toBe("字幕");
  for (const ename of ["SUB MARINE", "THE DUB", "FILM / SUBMARINE", "FILM", ""]) {
    expect(parse([movie("1", ename)])[0].format).toBeNull();
  }
});
