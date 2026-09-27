import { describe, expect, it, vi } from "vitest";
import { synopsisUrl, researchSynopsis, refreshSynopses, type SynopsisModel } from "../worker/src/synopsis-research";
import { testDatabase } from "./helpers/sqlite-d1";
const input={titleKey:"test",japaneseTitle:"テスト映画",englishTitle:"Test Film",sourceUrl:"https://gkids.com/films/test/"};
const quote="A lonely child meets a visitor from another world and the two become friends.";
const html=`<main><h1>Test Film</h1><h2>Story</h2><p>${quote}</p></main>`;
const answer={found:true,quote,ja:"孤独な子どもが異世界からの訪問者と出会い、友情を育む。",en:"A lonely child befriends a visitor from another world."};
const check={sameFilm:true,isPlot:true,supported:true,fluent:true};
const model=(answers: unknown[]=[answer,check]):SynopsisModel=>({decide:vi.fn(async()=>answers.shift())});
describe("Workers AI synopsis enrichment",()=>{
  it("requires a matching source and verbatim evidence, then independently checks both language summaries",async()=>{
    const m=model(); const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
    expect(await researchSynopsis(input,m,fetcher)).toEqual({ja:answer.ja,en:answer.en,evidence:quote,sourceUrl:input.sourceUrl});
    expect(fetcher).toHaveBeenCalledTimes(1);expect(m.decide).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:"error"});
  });
  it.each(["https://127.0.0.1/","http://gkids.com/","https://gkids.com.evil.test/","https://user:password@gkids.com/","https://gkids.com:8443/"])("rejects unsafe source %s",url=>expect(synopsisUrl(url)).toBeNull());
  it("does not accept invented evidence, wrong adaptations or non-plot copy",async()=>{
    for(const outputs of [[{...answer,quote:"This quote never appeared on the cited source page at all."}], [answer,{...check,sameFilm:false}], [answer,{...check,isPlot:false}], [answer,{...check,supported:false}], [answer,{...check,fluent:false}]])
      expect(await researchSynopsis(input,model(outputs),vi.fn<typeof fetch>().mockResolvedValue(new Response(html)))).toBeNull();
    const m=model();
    expect(await researchSynopsis(input,m,vi.fn<typeof fetch>().mockResolvedValue(new Response(html.replace('Test Film','Other Film'))))).toBeNull();
    expect(m.decide).not.toHaveBeenCalled();
  });
  it("only follows a discovered same-origin story link within five total external/AI calls",async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(html+'<a href="story/">Story</a><a href="https://evil.test/story">Story</a>')).mockResolvedValueOnce(new Response(html));
    const m=model([{found:false},answer,check]);
    expect((await researchSynopsis(input,m,fetcher))?.sourceUrl).toBe(input.sourceUrl+'story/');
    expect(fetcher.mock.calls.length+vi.mocked(m.decide).mock.calls.length).toBe(5);
  });
  it.each([401,403,429])("stops on HTTP %i without another request",async status=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status}));const m=model();
    await expect(researchSynopsis(input,m,fetcher)).rejects.toThrow("synopsis_access_blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);expect(m.decide).not.toHaveBeenCalled();
  });
  it("preserves reviewed synopses, stops concurrent work, persists daily backoff and caps lifetime attempts",async()=>{
    const {db,sqlite}=testDatabase();
    try {
      sqlite.prepare(`INSERT INTO movie_title_research(title_key,japanese_title,english_title,source_url,status,next_attempt_at,updated_at)
        VALUES(?,?,?,?, 'verified','past','past')`).run(input.titleKey,input.japaneseTitle,input.englishTitle,input.sourceUrl);
      sqlite.exec("INSERT INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,approval,updated_at) VALUES('movil','Movil','Movil','yokohama','Yokohama','test',35,139,'https://example.org','approved','now')");
      const day=new Date(Date.now()+3600000).toISOString();
      sqlite.prepare(`INSERT INTO showings(id,source_id,cinema_id,movie_key,title,starts_at,booking_url,fetched_at)
        VALUES('research','movil','movil',?,?,?,'https://example.org','now')`).run(input.titleKey,input.japaneseTitle,day);
      const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:429}));
      expect((await refreshSynopses(db,model(),fetcher)).status).toBe('paused');
      expect((await refreshSynopses(db,model(),fetcher)).status).toBe('cooldown');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(sqlite.prepare('SELECT attempts,last_reason FROM synopsis_research').get()).toEqual({attempts:1,last_reason:'synopsis_access_blocked'});
      sqlite.exec("UPDATE synopsis_research_gate SET next_attempt_at='1970'; UPDATE synopsis_research SET next_attempt_at='1970',attempts=5");
      expect((await refreshSynopses(db,model(),fetcher)).status).toBe('nothing_due');
      sqlite.exec("UPDATE synopsis_research_gate SET next_attempt_at='1970'; UPDATE synopsis_research SET attempts=0");
      const good=vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
      expect((await refreshSynopses(db,model(),good)).status).toBe('saved');
      expect(sqlite.prepare('SELECT generation_method FROM movie_synopses').get()?.generation_method).toBe('workers_ai');
      sqlite.exec("UPDATE synopsis_research_gate SET next_attempt_at='1970'");
      expect((await refreshSynopses(db,model(),good)).status).toBe('nothing_due');
      expect(good).toHaveBeenCalledTimes(1);
    }finally{sqlite.close();}
  });
});
