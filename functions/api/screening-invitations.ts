import type { AuthContextData, PagesEnv } from '../_lib/env';
import type { ScreeningInvitation } from '../../shared/screening-invitations';
const headers = { 'cache-control': 'private, no-store' };
type Context = Parameters<PagesFunction<PagesEnv,string,AuthContextData>>[0];
const reply = (body: unknown, status = 200) => Response.json(body,{status,headers});
function allowed(ctx: Context, write = false) {
  return ctx.env.PUBLIC_MODE !== 'true' && !!ctx.data.userId && ctx.data.authUser?.status === 'active'
    && (!write || ctx.request.headers.get('origin') === new URL(ctx.request.url).origin);
}
// Recheck both active memberships and the sender's future plan on every read/write.
const scope = `FROM screening_invitations i
 JOIN viewing_plans p ON p.user_id=i.sender_id AND p.showing_id=i.showing_id
 JOIN sharing_group_members a ON a.group_id=i.group_id AND a.user_id=i.sender_id
 JOIN sharing_group_members b ON b.group_id=i.group_id AND b.user_id=i.recipient_id
 JOIN users sender ON sender.id=i.sender_id JOIN users recipient ON recipient.id=i.recipient_id
 WHERE sender.status='active' AND recipient.status='active' AND sender.email IS NOT NULL AND recipient.email IS NOT NULL
 AND datetime(p.starts_at)>CURRENT_TIMESTAMP`;
export const onRequestGet: PagesFunction<PagesEnv,string,AuthContextData> = async ctx => {
  if (!allowed(ctx)) return reply({error:'forbidden'},403);
  const group = new URL(ctx.request.url).searchParams.get('group');
  if (!group) return reply({error:'invalid_group'},400);
  const member = await ctx.env.DB.prepare('SELECT 1 FROM sharing_group_members WHERE group_id=? AND user_id=?').bind(group,ctx.data.userId).first();
  if (!member) return reply({error:'forbidden'},403);
  const rows = await ctx.env.DB.prepare(`SELECT i.id,i.sender_id senderId,i.recipient_id recipientId,i.showing_id showingId,i.status,p.title,p.cinema_name cinemaName,p.starts_at startsAt,p.format ${scope} AND i.group_id=? AND (i.sender_id=? OR i.recipient_id=?) ORDER BY p.starts_at,i.created_at,i.id`).bind(group,ctx.data.userId,ctx.data.userId).all<ScreeningInvitation>();
  return reply({invitations:rows.results});
};
export const onRequestPost: PagesFunction<PagesEnv,string,AuthContextData> = async ctx => {
  if (!allowed(ctx,true)) return reply({error:'forbidden'},403);
  let body: {groupId?:unknown; showingId?:unknown; recipientIds?:unknown};
  try {body = await ctx.request.json();} catch {return reply({error:'invalid_json'},400);}
  if (!body || typeof body.groupId!=='string' || typeof body.showingId!=='string' || !Array.isArray(body.recipientIds) || !body.recipientIds.length || body.recipientIds.length>50 || body.recipientIds.some(id=>typeof id!=='string' || !id || id===ctx.data.userId)) return reply({error:'invalid_request'},400);
  const recipients = [...new Set(body.recipientIds as string[])];
  const members = await ctx.env.DB.prepare(`SELECT m.user_id id FROM sharing_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND u.status='active' AND u.email IS NOT NULL`).bind(body.groupId).all<{id:string}>();
  if (![ctx.data.userId,...recipients].every(id=>members.results.some(m=>m.id===id))) return reply({error:'forbidden'},403);
  const plan = await ctx.env.DB.prepare('SELECT 1 FROM viewing_plans WHERE user_id=? AND showing_id=? AND datetime(starts_at)>CURRENT_TIMESTAMP').bind(ctx.data.userId,body.showingId).first();
  if (!plan) return reply({error:'plan_unavailable'},409);
  const now = new Date().toISOString();
  await ctx.env.DB.batch(recipients.map(recipient=>ctx.env.DB.prepare(`INSERT INTO screening_invitations(id,group_id,sender_id,recipient_id,showing_id,created_at,updated_at)
    SELECT ?,a.group_id,a.user_id,b.user_id,p.showing_id,?,? FROM sharing_group_members a JOIN sharing_group_members b ON b.group_id=a.group_id
    JOIN users sender ON sender.id=a.user_id JOIN users recipient ON recipient.id=b.user_id
    JOIN viewing_plans p ON p.user_id=a.user_id WHERE a.group_id=? AND a.user_id=? AND b.user_id=? AND p.showing_id=?
    AND sender.status='active' AND recipient.status='active' AND sender.email IS NOT NULL AND recipient.email IS NOT NULL AND datetime(p.starts_at)>CURRENT_TIMESTAMP
    ON CONFLICT(group_id,sender_id,recipient_id,showing_id) DO NOTHING`).bind(crypto.randomUUID(),now,now,body.groupId,ctx.data.userId,recipient,body.showingId)));
  return reply({ok:true},201);
};
export const onRequestPatch: PagesFunction<PagesEnv,string,AuthContextData> = async ctx => {
  if (!allowed(ctx,true)) return reply({error:'forbidden'},403);
  let body: {id?:unknown; action?:unknown};
  try {body = await ctx.request.json();} catch {return reply({error:'invalid_json'},400);}
  if (!body || typeof body.id!=='string' || typeof body.action!=='string' || !['accept','decline','cancel'].includes(body.action)) return reply({error:'invalid_request'},400);
  const status = body.action==='accept'?'accepted':body.action==='decline'?'declined':'cancelled';
  const actor = body.action==='cancel'?'sender_id':'recipient_id';
  const row = await ctx.env.DB.prepare(`UPDATE screening_invitations SET status=?,updated_at=? WHERE id=? AND status='pending' AND ${actor}=?
    AND id IN (SELECT i.id ${scope}) RETURNING id`).bind(status,new Date().toISOString(),body.id,ctx.data.userId).first();
  return reply(row?{ok:true}:{error:'invitation_unavailable'},row?200:409);
};
