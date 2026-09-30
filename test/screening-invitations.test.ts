import {afterEach,beforeEach,expect,it} from 'vitest';
import {testDatabase} from './helpers/sqlite-d1';
import {sharedShowing} from './helpers/shared-showings';
import {onRequestGet,onRequestPost,onRequestPatch} from '../functions/api/screening-invitations';
let store:ReturnType<typeof testDatabase>,showing:string;
beforeEach(()=>{
  store=testDatabase();
  for(const id of ['alice','bob','eve']) store.sqlite.prepare("INSERT INTO users(id,email,display_email,role,status,created_at,updated_at) VALUES (?,?,?,'member','active','','')").run(id,id+'@example.com',id+'@example.com');
  store.sqlite.exec("INSERT INTO sharing_groups VALUES ('ab','Film friends',''); INSERT INTO sharing_group_members VALUES ('ab','alice'),('ab','bob');");
  showing=sharedShowing(store.sqlite,'映画');
  store.sqlite.prepare(`INSERT INTO viewing_plans(user_id,showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,booking_url,created_at,updated_at)
    SELECT 'alice',id,movie_key,title,cinema_id,'Test','Test',starts_at,booking_url,'','' FROM showings WHERE id=?`).run(showing);
});
afterEach(()=>store.sqlite.close());
function ctx(user='alice',method='GET',body?:unknown,origin='https://example.com') {
  return {env:{DB:store.db,PUBLIC_MODE:'false'},data:{userId:user,authUser:{status:'active'}},request:new Request('https://example.com/api/screening-invitations?group=ab',{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})} as Parameters<typeof onRequestGet>[0];
}
const send=(recipientIds=['bob'])=>onRequestPost(ctx('alice','POST',{groupId:'ab',showingId:showing,recipientIds}));
const invitations=async(user='bob')=>(await (await onRequestGet(ctx(user))).json() as {invitations:{id:string;status:string}[]}).invitations;
it('invites without registering the recipient, accepts atomically, and preserves existing reservations',async()=>{
  expect((await send()).status).toBe(201);expect((await send()).status).toBe(201);
  expect(await invitations()).toHaveLength(1);
  expect(store.sqlite.prepare("SELECT * FROM viewing_plans WHERE user_id='bob'").get()).toBeUndefined();
  const id=(await invitations())[0].id;
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(200);
  expect(store.sqlite.prepare("SELECT showing_id,reserved_at FROM viewing_plans WHERE user_id='bob'").get()).toMatchObject({showing_id:showing,reserved_at:null});
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(409);
});
it('keeps a preexisting reservation when accepting',async()=>{
  store.sqlite.prepare("INSERT INTO viewing_plans SELECT 'bob',showing_id,movie_key,title,cinema_id,cinema_name,cinema_short_name,starts_at,ends_at,screen,format,booking_url,created_at,updated_at,'reserved' FROM viewing_plans WHERE user_id='alice'").run();
  await send();const id=(await invitations())[0].id;
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(200);
  expect(store.sqlite.prepare("SELECT reserved_at FROM viewing_plans WHERE user_id='bob'").get()).toMatchObject({reserved_at:'reserved'});
});
it('allows recipient decline or sender cancel without making a plan',async()=>{
  await send();const id=(await invitations())[0].id;
  expect((await onRequestPatch(ctx('alice','PATCH',{id,action:'decline'}))).status).toBe(409);
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'cancel'}))).status).toBe(409);
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'decline'}))).status).toBe(200);
  expect(store.sqlite.prepare("SELECT * FROM viewing_plans WHERE user_id='bob'").get()).toBeUndefined();
});
it('rejects unrelated users, mixed audiences, self invites, cross origin and public mode',async()=>{
  expect((await onRequestGet(ctx('eve'))).status).toBe(403);
  expect((await send(['bob','eve'])).status).toBe(403);expect(await invitations()).toHaveLength(0);
  expect((await send(['alice'])).status).toBe(400);
  expect((await onRequestPost(ctx('alice','POST',{groupId:'ab',showingId:showing,recipientIds:['bob']},'https://evil.example'))).status).toBe(403);
  const context=ctx();context.env.PUBLIC_MODE='true';expect((await onRequestGet(context)).status).toBe(403);
  await send();const id=(await invitations())[0].id;
  expect((await onRequestPatch(ctx('eve','PATCH',{id,action:'accept'}))).status).toBe(409);
});
it('hides invitations and blocks acceptance after account withdrawal or the screening starts',async()=>{
  await send();const id=(await invitations())[0].id;
  store.sqlite.exec("UPDATE users SET status='disabled' WHERE id='alice'");
  expect(await invitations()).toHaveLength(0);
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(409);
  store.sqlite.exec("UPDATE users SET status='active' WHERE id='alice'; UPDATE viewing_plans SET starts_at='2020-01-01' WHERE user_id='alice'");
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(409);
  expect((await send()).status).toBe(409);
});
it('removes invitations when membership or the sender plan is removed',async()=>{
  store.sqlite.exec('PRAGMA foreign_keys=ON');await send();
  store.sqlite.exec("DELETE FROM sharing_group_members WHERE user_id='bob'");
  expect(store.sqlite.prepare('SELECT * FROM screening_invitations').get()).toBeUndefined();
});

it('lets the sender cancel a pending invitation and prevents later acceptance',async()=>{
  await send();const id=(await invitations())[0].id;
  expect((await onRequestPatch(ctx('alice','PATCH',{id,action:'cancel'}))).status).toBe(200);
  expect((await onRequestPatch(ctx('bob','PATCH',{id,action:'accept'}))).status).toBe(409);
  expect(store.sqlite.prepare("SELECT * FROM viewing_plans WHERE user_id='bob'").get()).toBeUndefined();
});
it('removes the invitation when the sender deletes the plan, keeping unrelated plans',async()=>{
  store.sqlite.exec('PRAGMA foreign_keys=ON');await send();
  store.sqlite.exec("DELETE FROM viewing_plans WHERE user_id='alice'");
  expect(await invitations()).toHaveLength(0);
  expect(store.sqlite.prepare('SELECT * FROM screening_invitations').get()).toBeUndefined();
});

it('keeps the sender language version visible to the invited member',async()=>{
  store.sqlite.prepare("UPDATE viewing_plans SET format='字幕 / IMAX' WHERE user_id='alice'").run();
  await send();
  const data=await (await onRequestGet(ctx('bob'))).json() as {invitations:{format:string}[]};
  expect(data.invitations[0].format).toBe('字幕 / IMAX');
});
