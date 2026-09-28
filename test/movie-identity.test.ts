import { afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { MovieIdentityBudget, fetchTjoyMovieDetail, parseTjoyMovieDetail, titleProblem, validateSourceMovieTitles } from "../worker/src/movie-identity";
import { normalizeShowingMovieTitle, refreshBatch } from "../worker/src/index";
import type { NormalizedShowing } from "../shared/types";
const source = "yokohama-burg13";
const row = (id="C9000",title="新しい映画",day="27"): NormalizedShowing => ({sourceId:source,cinemaId:source,movieKey:id,title,imageUrl:null,startsAt:`2026-09-${day}T04:00:00.000Z`,endsAt:null,screen:"1",format:null,bookingUrl:"https://tjoy.jp/yokohama_burg13",purchasable:false});
const detail = (title="新しい映画",id="C9000") => `<body id="film-detail"><h1 class="carosuel-header">${title}</h1><button data-code="${id}"></button></body>`;
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe("official source movie identity",()=>{
  it("requires the detail page's own ID and exactly one nonempty title",()=>{
    expect(parseTjoyMovieDetail(detail(),"C9000")).toBe("新しい映画");
    for(const html of ["<h1>Access denied</h1>",detail("新しい映画","C9001"),detail(""),detail()+detail()]) expect(()=>parseTjoyMovieDetail(html,"C9000")).toThrow();
  });
  it("resolves a previously unknown truncated title from the same official ID and caches it",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      const resolve=vi.fn(async()=>"別の映画:正式な副題");
      const input=row("C9000","別の映画:正");
      const first=await validateSourceMovieTitles(db,source,[input],new MovieIdentityBudget(),resolve);
      expect(first.dateErrors.size).toBe(0);
      expect(normalizeShowingMovieTitle(first.showings[0])).toMatchObject({title:"別の映画:正式な副題",movieKey:"別の映画:正式な副題",sourceMovieId:"C9000",sourceTitle:"別の映画:正"});
      await validateSourceMovieTitles(db,source,[input],new MovieIdentityBudget(),resolve);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(sqlite.prepare("SELECT verification,evidence_url FROM source_movie_identity").get()).toMatchObject({verification:"official",evidence_url:"https://tjoy.jp/yokohama_burg13/cinema_detail/C9000"});
    } finally {sqlite.close();}
  });
  it("shares a five-request limit, checkpoints verified IDs, and resumes without refetching them",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      const resolve=vi.fn(async(_source:string,id:string)=>`作品${id}`);
      const rows=Array.from({length:7},(_,i)=>row(`C${9000+i}`,`作品C${9000+i}`));
      const first=await validateSourceMovieTitles(db,source,rows,new MovieIdentityBudget(),resolve);
      expect(resolve).toHaveBeenCalledTimes(5);
      expect(first.showings).toHaveLength(0); // Entire affected date is held.
      expect(first.dateErrors.size).toBe(1);
      expect(sqlite.prepare("SELECT count(*) n FROM source_movie_identity").get()?.n).toBe(5);
      const second=await validateSourceMovieTitles(db,source,rows,new MovieIdentityBudget(),resolve);
      expect(resolve).toHaveBeenCalledTimes(7);
      expect(second.showings).toHaveLength(7);
      expect(sqlite.prepare("SELECT count(*) n FROM movie_ingestion_issues WHERE resolved_at IS NULL").get()?.n).toBe(0);
    } finally {sqlite.close();}
  });
  it("stops after one failed detail request, isolates dates and records recoverable issues",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      const resolve=vi.fn(async()=>{throw new Error("403");});
      const failed=await validateSourceMovieTitles(db,source,[row(),row("C9001")],new MovieIdentityBudget(),resolve);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(failed.showings).toHaveLength(0);
      expect(sqlite.prepare("SELECT count(*) n FROM movie_ingestion_issues WHERE resolved_at IS NULL").get()?.n).toBe(2);
      const retry=await validateSourceMovieTitles(db,source,[row()],new MovieIdentityBudget(),async()=>"新しい映画");
      expect(retry.showings).toHaveLength(1);
    } finally {sqlite.close();}
  });
  it("rechecks changed/expired observations and never silently moves a known ID to another film",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-01"));
    const {db,sqlite}=testDatabase();
    try {
      const resolve=vi.fn(async()=>"新しい映画");
      await validateSourceMovieTitles(db,source,[row()],new MovieIdentityBudget(),resolve);
      vi.setSystemTime(new Date("2026-09-20"));
      await validateSourceMovieTitles(db,source,[row()],new MovieIdentityBudget(),resolve);
      expect(sqlite.prepare("SELECT verified_at FROM source_movie_identity").get()?.verified_at).toBe("2026-09-01T00:00:00.000Z");
      vi.setSystemTime(new Date("2026-10-02"));
      await validateSourceMovieTitles(db,source,[row()],new MovieIdentityBudget(),resolve);
      expect(resolve).toHaveBeenCalledTimes(2);
      const changed=await validateSourceMovieTitles(db,source,[row("C9000","別作品")],new MovieIdentityBudget(),async()=>"別作品");
      expect(changed.showings).toHaveLength(0);
      expect(sqlite.prepare("SELECT canonical_title FROM source_movie_identity").get()?.canonical_title).toBe("新しい映画");
    } finally {sqlite.close();}
  });
  it("keeps distinct films with similar prefixes separate and blocks destructive key collisions",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      const resolve=async(_source:string,id:string)=>id==="C9000"?"映画の旅":"映画の旅 2";
      expect((await validateSourceMovieTitles(db,source,[row(),row("C9001")],new MovieIdentityBudget(),resolve)).showings).toHaveLength(2);
      const collision=await validateSourceMovieTitles(db,source,[row("C9002"),row("C9003")],new MovieIdentityBudget(),async(_source,id)=>id==="C9002"?"別映画【前編】":"別映画【後編】");
      expect(collision.showings).toHaveLength(0);
      expect([...collision.dateErrors.values()][0]).toContain("canonical_key_collision");
    } finally {sqlite.close();}
  });
  it("checks non-T-Joy title changes and malformed titles without any extra requests",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      const sourceId="aeon-minatomirai";
      const resolve=vi.fn(async()=>"unused");
      const input={...row("42","インフィニティビジョン 映画タイトル"),sourceId,cinemaId:sourceId};
      const first=await validateSourceMovieTitles(db,sourceId,[input],new MovieIdentityBudget(),resolve);
      expect(normalizeShowingMovieTitle(first.showings[0])).toMatchObject({title:"映画タイトル",format:"INFINITY VISION"});
      const changed=await validateSourceMovieTitles(db,sourceId,[{...input,title:"映画タイ"}],new MovieIdentityBudget(),resolve);
      expect(changed.showings).toHaveLength(0);
      expect(resolve).not.toHaveBeenCalled();
      expect(titleProblem("作品&#x20;")).toBe("markup_in_title");
      expect(titleProblem("【字幕】")).toBe("empty_or_oversized_title");
      expect(titleProblem("未定")).toBe("placeholder_title");
      expect(titleProblem("愛")).toBeNull(); // A short title can be legitimate.
    } finally {sqlite.close();}
  });
  it("bounds transport size and never follows redirects or retries failures",async()=>{
    const fetcher=vi.fn(async()=>new Response(new Uint8Array(2*1024*1024+1)));
    vi.stubGlobal("fetch",fetcher);
    await expect(fetchTjoyMovieDetail(source,"C9000")).rejects.toThrow("too_large");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject(["https://tjoy.jp/yokohama_burg13/cinema_detail/C9000",{redirect:"error",signal:expect.any(AbortSignal)}]);
    await expect(fetchTjoyMovieDetail(source,"../evil")).rejects.toThrow("missing_stable_movie_id");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("a title validation failure preserves stored showings and search while healthy days refresh",async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-09-27T00:00:00Z"));
  const {db,sqlite}=testDatabase();
  try {
    let changed=false;
    const quickAction=vi.fn(async(_action:string,{url}:{url:string})=>{
      const day=new URL(url).searchParams.get("date")!;
      const broken=changed&&day==="2026-09-27";
      return Response.json({success:true,result:`<div id="film"><a class="calendar-active" data-date="${day}"></a><section class="section-container"><h2 class="js-title-film">${broken?"新しい映":"新しい映画"}</h2><a href="/yokohama_burg13/film_detail/C9000">詳細</a><div class="schedule-box"><p class="schedule-time">13:00 ～ 15:00</p></div></section></div>`});
    });
    const env={DB:db,SCHEDULE_DAYS:"2",BROWSER:{quickAction} as unknown as BrowserRun};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(detail())));
    expect((await refreshBatch(env,0,new Set([source]))).succeeded).toBe(1);
    const before=sqlite.prepare("SELECT * FROM showings").all();
    const search=sqlite.prepare("SELECT * FROM showing_search").all();
    changed=true;vi.setSystemTime(new Date("2026-09-27T01:00:00Z"));
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:403})));
    expect((await refreshBatch(env,0,new Set([source]))).failed).toBe(1);
    // One source ID has conflicting observations across dates: both dates must
    // wait for its official verification, rather than publish a partial film.
    expect(sqlite.prepare("SELECT * FROM showings").all()).toEqual(before);
    expect(sqlite.prepare("SELECT * FROM showing_search").all()).toEqual(search);
    expect(sqlite.prepare("SELECT count(*) n FROM showings WHERE source_movie_id='C9000' AND source_title='新しい映画'").get()?.n).toBe(2);
    expect(sqlite.prepare("SELECT count(*) n FROM source_date_health WHERE status='error'").get()?.n).toBe(2);
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(detail())));
    expect((await refreshBatch(env,0,new Set([source]))).succeeded).toBe(1);
    expect(sqlite.prepare("SELECT count(*) n FROM movie_ingestion_issues WHERE resolved_at IS NULL").get()?.n).toBe(0);
  } finally {sqlite.close();}
});
