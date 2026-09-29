import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { MovieTimes } from "../src/MovieTimes";
import { appHashStateFromHash, hashForAppView } from "../src/lib";
import type { Showing } from "../shared/types";
it("links each time to its exact showing, keeping duplicates at different cinemas distinguishable",()=>{
  const row={title:"テスト",startsAt:"2026-09-27T01:30:00Z",cinemaName:"ムービル"} as Showing;
  const $=load(renderToStaticMarkup(<MovieTimes showings={[{...row,id:"late",startsAt:"2026-09-27T03:30:00Z"},{...row,id:"one"},{...row,id:"two",cinemaName:"T・ジョイ横浜"}]} />));
  expect($('a').map((_,el)=>$(el).text()).get()).toEqual(['10:30','10:30','12:30']);
  const routes=$('a').map((_,el)=>appHashStateFromHash($(el).attr('href')!)).get();
  expect(new Set(routes.map(r=>r.showing)).size).toBe(3);
  expect(routes[0]).toMatchObject({view:'schedule',date:'2026-09-27',movie:'テスト'});
  expect($('a').eq(0).attr('aria-label')).not.toBe($('a').eq(1).attr('aria-label'));
});
describe("showing hash compatibility",()=>{
 it("round-trips punctuation without changing existing movie URLs",()=>{
   const showing='movil|映画 + / ? #|09:00';
   expect(appHashStateFromHash(hashForAppView('schedule',{date:'2026-09-27',movie:'film',showing})).showing).toBe(showing);
   expect(hashForAppView('movie',{movie:'film'})).toBe('#movie?movie=film');
 });
});
