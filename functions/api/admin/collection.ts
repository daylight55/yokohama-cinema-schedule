import type { AuthContextData, PagesEnv } from "../../_lib/env";
import { loadCollectionStatus } from "../collection-status";
import { dateRange, todayInJst } from "../../../shared/date";
import { SOURCE_BATCH_IDS } from "../../../shared/collection-sources";
import type { CollectionJob } from "../../../shared/collection-jobs";

const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {"cache-control": "no-store"}});
type Handler = PagesFunction<PagesEnv, string, AuthContextData>;
export const onRequestGet: Handler = async ({env, data}) => {
  if (data.authUser?.role !== "admin") return reply({error:"forbidden"},403);
  const [status, jobs, history] = await Promise.all([
    loadCollectionStatus(env.DB, false),
    env.DB.prepare("SELECT * FROM collection_jobs ORDER BY requested_at DESC LIMIT 50").all<CollectionJob>(),
    env.DB.prepare("SELECT * FROM source_date_history ORDER BY id DESC LIMIT 100").all(),
  ]);
  return reply({status, jobs:jobs.results, history:history.results});
};
export const onRequestPost: Handler = async ({env, data, request}) => {
  if (data.authUser?.role !== "admin" || request.headers.get("origin") !== new URL(request.url).origin)
    return reply({error:"forbidden"},403);
  let body: {sourceId?: unknown; date?: unknown};
  try { body = await request.json(); } catch { return reply({error:"invalid_json"},400); }
  if (!body || typeof body.sourceId !== "string" || typeof body.date !== "string" ||
      !dateRange(todayInJst(),7).includes(body.date)) return reply({error:"invalid_target"},400);
  const batch = [0,1,2].find(n => SOURCE_BATCH_IDS[n as 0|1|2].has(body.sourceId as string));
  if (batch === undefined) return reply({error:"invalid_target"},400);
  const cinema = await env.DB.prepare("SELECT id FROM cinemas WHERE id=? AND approval != 'disabled' AND (active_until IS NULL OR active_until >= ?)")
    .bind(body.sourceId,body.date).first();
  if (!cinema) return reply({error:"invalid_target"},400);
  const id = crypto.randomUUID(), now = new Date();
  const sources = JSON.stringify([body.sourceId]), dates = JSON.stringify([body.date]);
  // One atomic statement handles simultaneous clicks and a five-minute cooldown.
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO collection_jobs
    (id,trigger_kind,requested_by,batch,source_ids,dates,state,requested_at)
    SELECT ?,'admin',?,?,?,?, 'queued',?
    WHERE NOT EXISTS (SELECT 1 FROM collection_jobs WHERE trigger_kind='admin'
      AND source_ids=? AND dates=? AND (state IN ('queued','running') OR requested_at > ?))`)
    .bind(id,data.userId,batch,sources,dates,now.toISOString(),sources,dates,
      new Date(now.getTime()-300000).toISOString()).run();
  if (!result.meta.changes) return reply({error:"already_requested"},409);
  return reply({id,state:"queued"},202);
};
