import { ScreeningFormat, screeningLanguageSuffix } from "./ScreeningFormat";
import {useEffect,useState} from 'react';
import type {SharingResponse} from '../shared/sharing';
import type {ScreeningInvitation} from '../shared/screening-invitations';
import {localize as t,localizedDate,movieTitle,localeCode} from './i18n';
import {hashForAppView} from './lib';

export function ScreeningInvitations({data,onChanged}:{data:SharingResponse;onChanged:(joined:boolean)=>void}) {
  const [invitations,setInvitations] = useState<ScreeningInvitation[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [open,setOpen] = useState(false);
  const [showing,setShowing] = useState('');
  const [selected,setSelected] = useState<string[]>([]);
  const [notice,setNotice] = useState('');
  const [retry,setRetry] = useState(0);
  const members = data.members.filter(m=>m.userId!==data.userId);
  const ownPlans = data.plans.filter(p=>p.userId===data.userId);
  const names = new Map(data.members.map(m=>[m.userId,m.name]));
  const date = localizedDate({month:'short',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);setError('');
    const refresh = async () => {
      try {
        const response = await fetch(`/api/screening-invitations?group=${encodeURIComponent(data.groupId!)}`,{signal:controller.signal});
        if (!response.ok) throw Error();
        const value = await response.json() as {invitations:ScreeningInvitation[]};
        if (!controller.signal.aborted) setInvitations(value.invitations);
      } catch {if (!controller.signal.aborted) setError('招待を取得できませんでした。');}
      finally {if (!controller.signal.aborted) setLoading(false);}
    };
    void refresh();
    const timer = window.setInterval(()=>void refresh(),30000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[data.groupId,retry]);
  if (!data.groupId) return null;
  const mutate = async (body:object,method:'POST'|'PATCH') => {
    setBusy(true);setError('');setNotice('');
    try {
      const response = await fetch('/api/screening-invitations',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) throw Error();
      setRetry(v=>v+1);
      if (method==='POST') {setOpen(false);setSelected([]);setShowing('');setNotice('招待を送りました。');}
      else {onChanged((body as {action?:string}).action === "accept");}
    } catch {setError('招待を保存できませんでした。予定とメンバーを確認して再試行してください。');}
    finally {setBusy(false);}
  };
  return <section className="screening-invitations" aria-labelledby="screening-invitations-title">
    <div className="screening-invitation-heading">
      <h2 id="screening-invitations-title">{t('一緒に観に行く')}</h2>
      {!open && <button type="button" disabled={!members.length} onClick={()=>setOpen(true)}>{t('映画に招待')}</button>}
    </div>
    {open && <form onSubmit={event=>{event.preventDefault();if (!busy && showing && selected.length) void mutate({groupId:data.groupId,showingId:showing,recipientIds:selected},'POST');}}>
      {!ownPlans.length ? <p>{t('まず自分の鑑賞予定を登録してください。')} <a href={hashForAppView('schedule')}>{t('上映スケジュールから選ぶ')}</a></p> : <>
        <label>{t('鑑賞予定')}<select value={showing} required disabled={busy} onChange={event=>{setShowing(event.target.value);setSelected([]);}}>
          <option value="">{t('上映回を選択')}</option>
          {ownPlans.map(p=><option key={p.showingId} value={p.showingId}>{movieTitle(p.title)} · {t(p.cinemaName)} · {date.format(new Date(p.startsAt))}{screeningLanguageSuffix(p.format, t)}</option>)}
        </select></label>
        <fieldset disabled={busy}><legend>{t('招待するメンバー')}</legend>
          {members.map(m=><label key={m.userId}><input type="checkbox" disabled={invitations.some(i=>i.senderId===data.userId && i.recipientId===m.userId && i.showingId===showing)} checked={selected.includes(m.userId)} onChange={event=>setSelected(current=>event.target.checked?[...current,m.userId]:current.filter(id=>id!==m.userId))}/>{m.name}{invitations.some(i=>i.senderId===data.userId && i.recipientId===m.userId && i.showingId===showing) && ` · ${t("招待済み")}`}</label>)}
        </fieldset>
        <p>{t('参加すると同じ上映回が鑑賞予定に追加されます。チケットは各自で予約してください。')}</p>
      </>}
      <div className="screening-invitation-actions">
        {!!ownPlans.length && <button disabled={busy || !showing || !selected.length} type="submit">{t(busy?'送信中…':'招待を送る')}</button>}
        <button type="button" disabled={busy} onClick={()=>setOpen(false)}>{t('キャンセル')}</button>
      </div>
    </form>}
    {notice && <p role="status">{t(notice)}</p>}
    {error && <p role="alert">{t(error)} <button type="button" onClick={()=>setRetry(v=>v+1)}>{t('再読み込み')}</button></p>}
    {loading ? <p role="status">{t('読み込み中…')}</p> : !invitations.length ? <p className="muted">{t('映画への招待はまだありません。')}</p> : <ul className="screening-invitation-list">
      {invitations.map(invitation=><li key={invitation.id}>
        <strong>{movieTitle(invitation.title)}</strong>
        <ScreeningFormat format={invitation.format} language={localeCode() === "en-GB" ? "en" : "ja"} />
        <p>{t(invitation.cinemaName)} · <time dateTime={invitation.startsAt}>{date.format(new Date(invitation.startsAt))}</time></p>
        <p>{invitation.senderId===data.userId ? `${t('招待先')}: ${names.get(invitation.recipientId)??''}` : `${t('招待した人')}: ${names.get(invitation.senderId)??''}`}</p>
        {invitation.status==='pending' ? <div className="screening-invitation-actions">
          {invitation.recipientId===data.userId ? <>
            <button type="button" disabled={busy} onClick={()=>void mutate({id:invitation.id,action:'accept'},'PATCH')}>{t('参加する')}</button>
            <button type="button" disabled={busy} onClick={()=>void mutate({id:invitation.id,action:'decline'},'PATCH')}>{t('今回は見送る')}</button>
          </> : <><span>{t('返事待ち')}</span><button type="button" disabled={busy} onClick={()=>void mutate({id:invitation.id,action:'cancel'},'PATCH')}>{t('招待を取り消す')}</button></>}
        </div> : <span>{t(invitation.status==='accepted'?'参加':invitation.status==='declined'?'見送り':'招待取り消し済み')}</span>}
      </li>)}
    </ul>}
  </section>;
}
