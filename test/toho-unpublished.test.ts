import { expect, it } from "vitest";
import { parseTohoSchedule } from "../worker/src/parsers/toho";
const parse = (input: unknown) => parseTohoSchedule(input, "2026-10-02", "toho-kamiooka", "toho-kamiooka", "https://hlo.tohotheater.jp/");
it("recognizes the official unpublished response without hiding other errors", () => {
  expect(parse({ status: "1", data: [{ code: "ERR-1191", message: "上映スケジュールが登録されていません。" }] })).toEqual([]);
  expect(() => parse({ status: "1", data: [{ code: "ERR-9999" }] })).toThrow("invalid");
  expect(() => parse(null)).toThrow("invalid");
  expect(() => parse({})).toThrow("invalid");
});
