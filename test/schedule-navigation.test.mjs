import { createElement } from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { ScheduleNavigator } from "../src/ScheduleNavigator";
import { appHashStateFromHash } from "../src/lib";

it("keeps the selected date and search when switching views or days", () => {
  const $ = load(renderToStaticMarkup(createElement(ScheduleNavigator, { view: "movies", dates: ["2026-09-29", "2026-09-30"], selectedDate: "2026-09-29", query: "映画 & ムービル" })));
  const views = $('.schedule-destinations a').map((_, a) => appHashStateFromHash($(a).attr('href'))).get();
  expect(views.slice(0, 2)).toEqual([
    { view: 'schedule', date: '2026-09-29', query: '映画 & ムービル', movie: null },
    { view: 'movies', date: '2026-09-29', query: '映画 & ムービル', movie: null },
  ]);
  expect($('.schedule-destinations a[aria-current="page"]').attr('href')).toContain('#movies');
  expect(appHashStateFromHash($('.schedule-jump-dates a').last().attr('href'))).toMatchObject({
    view: 'movies', date: '2026-09-30', query: '映画 & ムービル',
  });
});

it("opens a daily schedule from a shared view without marking a day as already displayed", () => {
  const $ = load(renderToStaticMarkup(createElement(ScheduleNavigator, { view: "shared", dates: ["2026-09-29"], selectedDate: "2026-09-29", query: "" })));
  expect($('.schedule-jump-dates a[aria-current]').length).toBe(0);
  expect(appHashStateFromHash($('.schedule-jump-dates a').attr('href'))).toMatchObject({view:'schedule',date:'2026-09-29'});
});

it.each([null, "2026-09-01"])("selects today when switching from all dates or an expired day: %s", selectedDate => {
  const $ = load(renderToStaticMarkup(createElement(ScheduleNavigator, { view: "movies", dates: ["2026-09-29", "2026-09-30"], selectedDate, query: "映画" })));
  for (const a of $('.schedule-destinations a').toArray().slice(0, 2)) {
    expect(appHashStateFromHash($(a).attr('href'))).toMatchObject({date:'2026-09-29',query:'映画'});
  }
  expect($('.schedule-jump-dates a[aria-current]').length).toBe(0);
});
