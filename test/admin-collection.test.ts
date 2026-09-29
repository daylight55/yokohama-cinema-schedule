import { expect, it, vi, afterEach } from "vitest";
import { testDatabase } from "./helpers/sqlite-d1";
import { onRequestGet, onRequestPost } from "../functions/api/admin/collection";
import { claimCollectionJob, releaseCollectionJob, expireCollectionJobs } from "../shared/collection-jobs";
import { todayInJst } from "../shared/date";
afterEach(()=>vi.useRealTimers());
it("authorizes admin reads and writes, validates targets, and records one durable request",async()=>{
 const {db,sqlite}=testDatabase();
 const context=(role:string,body:unknown,origin="https://example.com")=>({env:{DB:db},data:{authUser:{role},userId:"admin-1"},request:new Request("https://example.com/api/admin/collection",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)})} as Parameters<typeof onRequestPost>[0]);
 try{
  sqlite.exec("INSERT INTO cinemas(id,name,short_name,area,area_label,address,latitude,longitude,source_url,updated_at,approval) VALUES ('aeon-minatomirai','Aeon','Aeon','yokohama','Test','Test',0,0,'https://example.com','','approved')");
  const target={sourceId:"aeon-minatomirai",date:todayInJst()};
  expect((await onRequestGet(context("member",{}))).status).toBe(403);
  expect((await onRequestPost(context("member",target))).status).toBe(403);
  expect((await onRequestPost(context("admin",target,"https://evil.test"))).status).toBe(403);
  expect((await onRequestPost(context("admin",{...target,date:"2000-01-01"}))).status).toBe(400);
  expect((await onRequestPost(context("admin",{...target,sourceId:"unknown"}))).status).toBe(400);
  expect((await onRequestPost(context("admin",target))).status).toBe(202);
  expect((await onRequestPost(context("admin",target))).status).toBe(409);
  const job=sqlite.prepare("SELECT * FROM collection_jobs").get()!;
  expect(job.requested_by).toBe("admin-1");expect(job.state).toBe("queued");
  sqlite.exec("UPDATE collection_jobs SET state='succeeded'");
  expect((await onRequestPost(context("admin",target))).status).toBe(409);
  expect((await onRequestGet(context("admin",{}))).status).toBe(200);
 }finally{sqlite.close();}
});
it("serializes collectors, protects lease ownership, and preserves interrupted results",async()=>{
 const {db,sqlite}=testDatabase(); const now=new Date();
 try{
  for(const id of ["a","b"])sqlite.prepare("INSERT INTO collection_jobs(id,trigger_kind,batch,source_ids,dates,state,requested_at) VALUES (?,'operator',0,'[]','[]','queued',?)").run(id,now.toISOString());
  expect(await claimCollectionJob(db,"a",now)).toBe(true);
  expect(await claimCollectionJob(db,"b",now)).toBe(false);
  await releaseCollectionJob(db,"b");
  expect(await claimCollectionJob(db,"b",now)).toBe(false);
  const later=new Date(now.getTime()+21*60000);await expireCollectionJobs(db,later);
  expect(sqlite.prepare("SELECT state FROM collection_jobs WHERE id='a'").get()?.state).toBe("interrupted");
  expect(await claimCollectionJob(db,"b",later)).toBe(true);
 }finally{sqlite.close();}
});
