import { expect, it } from "vitest";
import { splitScreeningFormat } from "../shared/screening-format";

it.each([
  ["字幕 / 日本語字幕付", ["日本語字幕"], ""],
  ["字幕 / IMAX", ["字幕"], "IMAX"],
  ["吹替版 / 2D", ["吹替"], "2D"],
  ["４ＤＸ／吹き替え版", ["吹替"], "4DX"],
  ["日本語字幕付き / 2D", ["日本語字幕"], "2D"],
  ["日本語吹替え版", ["日本語吹替"], ""],
  ["【字幕】 / 字幕 / DolbyAtmos", ["字幕"], "DolbyAtmos"],
  ["Subtitled / IMAX", ["字幕"], "IMAX"],
  ["DUB / 3D", ["吹替"], "3D"],
  ["吹替 / 日本語字幕", ["吹替", "日本語字幕"], ""],
])("separates explicit language versions from technical metadata: %s", (input, labels, detail) => {
  const result = splitScreeningFormat(input as string);
  expect(result.labels.map(item => item.label)).toEqual(labels);
  expect(result.detail).toBe(detail);
});
it.each([null, undefined, "", "2D", "日本語版", "舞台挨拶中継付き", "音声ガイド付き"])("does not invent a language version for %s", format => {
  expect(splitScreeningFormat(format)).toEqual({labels:[], detail:format ?? ""});
});
