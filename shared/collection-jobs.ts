import type { D1Database } from "@cloudflare/workers-types";
export interface SyncDateResult {
  date: string;
  status: 'published' | 'not_published' | 'error';
  count: number;
  error?: string;
}
export interface SyncSourceResult {
  sourceId: string;
  status: 'success' | 'failed';
  count: number;
  error?: string;
  dates: SyncDateResult[];
}
export interface SyncResult {
  startedAt: string;
  completedAt: string;
  succeeded: number;
  failed: number;
  sources: SyncSourceResult[];
  skipped?: boolean;
}
export interface CollectionJob {
  id: string;
  trigger_kind: 'scheduled' | 'admin' | 'operator';
  requested_by: string | null;
  batch: 0 | 1 | 2;
  source_ids: string;
  dates: string;
  state: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'interrupted' | 'skipped';
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_json: string | null;
  error_message: string | null;
}
export const COLLECTION_LOCK_MS = 20 * 60_000;
export async function expireCollectionJobs(db: D1Database, now = new Date()) {
  // A scheduled Worker invocation has a 15-minute wall time limit. Do not
  // silently retry an interrupted collection; preserve its partial journal.
  await db.prepare(`UPDATE collection_jobs SET state='interrupted', completed_at=?,
    error_message='Collection execution expired before completion'
    WHERE state='running' AND started_at < ?`)
    .bind(now.toISOString(), new Date(now.getTime() - COLLECTION_LOCK_MS).toISOString()).run();
}
export async function claimCollectionJob(db: D1Database, id: string, now = new Date()): Promise<boolean> {
  const lock = await db.prepare(`UPDATE collection_execution_lock SET owner=?, expires_at=?
    WHERE id=1 AND (owner IS NULL OR expires_at <= ?) RETURNING owner`)
    .bind(id, new Date(now.getTime() + COLLECTION_LOCK_MS).toISOString(), now.toISOString()).first();
  if (!lock) return false;
  try {
  const job = await db.prepare(`UPDATE collection_jobs SET state='running', started_at=?
    WHERE id=? AND state='queued' RETURNING id`).bind(now.toISOString(), id).first();
  if (!job) await releaseCollectionJob(db, id);
  return Boolean(job);
  } catch (error) { await releaseCollectionJob(db,id); throw error; }
}
export async function releaseCollectionJob(db: D1Database, id: string) {
  await db.prepare('UPDATE collection_execution_lock SET owner=NULL WHERE id=1 AND owner=?').bind(id).run();
}
