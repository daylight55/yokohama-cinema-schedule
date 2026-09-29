import { useEffect, useState } from "react";
import type { CollectionJob, SyncResult } from "../shared/collection-jobs";
import type { CollectionStatus } from "../shared/collection-status";
import type { Language } from "../shared/language";
import { PageHeader, PageShell } from "./PageLayout";
import "./admin-collection.css";

interface History { id:number; source_id:string; schedule_date:string; attempted_at:string; status:string; showing_count:number; error_message:string|null }
interface Payload {status:CollectionStatus; jobs:CollectionJob[]; history:History[]}
export function AdminCollectionPage({language,date:requestedDate}:{language:Language;date?:string}) {
  const [data,setData]=useState<Payload|null>(null);
  const [date,setDate]=useState(requestedDate??"");
  useEffect(()=>{if(requestedDate)setDate(requestedDate);},[requestedDate]);
  const [source,setSource]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const t=(ja:string,en:string)=>language==="en"?en:ja;
  const stamp=(s:string|null)=>s?new Date(s).toLocaleString(language==="en"?"en-GB":"ja-JP",{timeZone:"Asia/Tokyo"}):"—";
  const names=(id:string)=>data?.status.cinemas.find(c=>c.id===id)?.name??id;
  const state=(s:string)=>({
    queued:t("受付済み","Queued"),running:t("実行中","Running"),succeeded:t("取得処理完了","Finished"),
    partial:t("一部失敗","Partially failed"),failed:t("失敗","Failed"),interrupted:t("中断","Interrupted"),
    skipped:t("重複実行を回避","Skipped"),published:t("取得あり","Fetched"),not_published:t("取得0件・未公開の可能性","No results / possibly unpublished"),
    error:t("取得エラー","Fetch error"),missing:t("未確認","Not checked"),success:t("正常","Success")
  }[s]??s);
  useEffect(()=>{
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      try {
        const r=await fetch("/api/admin/collection",{signal:controller.signal});
        if(!r.ok) throw new Error(r.status===403?"forbidden":"unavailable");
        const payload:Payload=await r.json();
        if(controller.signal.aborted)return;
        setData(payload);setError("");
        setDate(d=>payload.status.dates.includes(d)?d:payload.status.dates[0]);
        setSource(s=>s||payload.status.cinemas[0]?.id||"");
      }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:"unavailable"); if(e instanceof Error && e.message==="forbidden")setData(null);}}
      if(!controller.signal.aborted)timer=setTimeout(load,10000);
    };
    void load();
    return()=>{controller.abort();clearTimeout(timer);};
  },[revision]);
  async function enqueue(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/admin/collection",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({sourceId:source,date})});
      if(!r.ok)throw new Error(r.status===409?"duplicate":"request_failed");
      setMessage(t("再実行を受け付けました。通常1分以内に開始します。他の同期中は順番を待ちます。","Queued. Usually starts within a minute, or after the current sync."));
      setRevision(v=>v+1);
    }catch(e){setMessage(e instanceof Error&&e.message==="duplicate"?t("同じ対象を受付済みです。再依頼は5分以上あけてください。","Already requested. Wait at least five minutes before retrying."):t("受付に失敗しました。履歴を更新して状態を確認してください。","Request failed. Refresh the history to check its state."));}
    finally{setBusy(false);}
  }
  const active=data?.jobs.some(j=>["queued","running"].includes(j.state)&&j.source_ids===JSON.stringify([source])&&j.dates===JSON.stringify([date]));
  return <PageShell className="admin-collection">
    <PageHeader eyebrow={t("管理者","Administrator")} title={t("上映情報の同期","Schedule synchronization")}
      lead={t("実行履歴と映画館ごとの取得結果を確認し、再実行できます。時刻は日本時間です。","Review collection history and retry a cinema. All times are Japan time.")}/>
    <p><a href="#admin-users">{t("ユーザー管理","User management")}</a> · <a href="#collection-status">{t("公開用の更新状況","Collection status")}</a></p>
    {error&&<p role="alert">{error==="forbidden"?t("管理者のみ利用できます。","Administrator access required."):t("読み込めませんでした。","Unable to load.")} <button onClick={()=>setRevision(v=>v+1)}>{t("再読み込み","Reload")}</button></p>}
    {!data&&!error&&<p role="status">{t("読み込み中…","Loading…")}</p>}
    {data&&<>
      <h2>{t("現在の保存状況と再実行","Current data and retry")}</h2>
      <p>{t("定期取得は毎日 0・6・12・18時の07分、17分、27分。取得成功は全上映の公開完了を意味しません。","Scheduled at 00/06/12/18:07, :17 and :27 JST. A successful fetch does not guarantee all showtimes are published.")}</p>
      <form onSubmit={e=>{e.preventDefault();void enqueue();}}>
        <label>{t("上映日","Showing date")}<select value={date} onChange={e=>{setDate(e.target.value);window.location.hash="#admin-collection?date="+e.target.value;}}>{data.status.dates.map(d=><option key={d}>{d}</option>)}</select></label>
        <label>{t("映画館","Cinema")}<select value={source} onChange={e=>setSource(e.target.value)}>{data.status.cinemas.filter(c=>!c.activeUntil||c.activeUntil>=date).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="submit" disabled={busy||active||!source||!date}>{busy?t("受付中…","Submitting…"):active?t("受付済み・実行待ち","Queued / running"):t("この映画館・日付を再取得","Retry this cinema and date")}</button>
      </form>
      <p role="status">{message}</p>
      <ul className="sync-results">{data.status.cinemas.map(c=>{const day=c.days.find(d=>d.date===date);return day&&<li key={c.id}><strong>{c.name}</strong><span>{state(day.status)} · {t("保存","Stored")} {day.storedCount} / {t("直近取得","Last fetched")} {day.fetchedCount}</span><small>{stamp(day.lastAttemptAt)}{day.stale&&t("（更新が古い）"," (stale)")}</small></li>;})}</ul>
      <h2>{t("実行履歴（最新50件）","Recent runs (50)")}</h2>
      <p>{t("10秒ごとに自動更新。定期実行・管理者・運用ツールからの実行を記録します。","Refreshes every 10 seconds. Records scheduled, administrator and operator runs.")}</p>
      {!data.jobs.length&&<p>{t("記録開始後の実行はまだありません。","No runs recorded yet.")}</p>}
      {data.jobs.map(job=>{
        let result:Partial<SyncResult>={};try{result=JSON.parse(job.result_json??"{}");}catch{/* Keep malformed legacy journal readable. */}
        const sourceIds:string[]=JSON.parse(job.source_ids);
        return <details key={job.id}><summary>{stamp(job.requested_at)} · {state(job.state)}<br/>{sourceIds.map(names).join(" / ")}</summary>
          <dl><dt>{t("実行ID / 起点","Run ID / trigger")}</dt><dd>{job.id} / {job.trigger_kind}</dd>
          <dt>{t("依頼者","Requested by")}</dt><dd>{job.requested_by??"—"}</dd>
          <dt>{t("対象日","Dates")}</dt><dd>{(JSON.parse(job.dates) as string[]).join(", ")}</dd>
          <dt>{t("開始 → 終了","Start → finish")}</dt><dd>{stamp(job.started_at)} → {stamp(job.completed_at)}</dd></dl>
          {job.error_message&&<pre>{job.error_message}</pre>}
          {result.sources?.map(s=><section key={s.sourceId}><h3>{names(s.sourceId)} · {state(s.status)} · {s.count}{t("件"," results")}</h3>{s.error&&<pre>{s.error}</pre>}<ul>{s.dates.map(d=><li key={d.date}>{d.date} · {state(d.status)} · {d.count}{d.error&&<pre>{d.error}</pre>}</li>)}</ul></section>)}
        </details>;
      })}
      <details><summary>{t("日付別の取得記録（最新100件・以前の実行を含む）","Date-level history (100, includes earlier runs)")}</summary>
      {data.history.map(h=><p key={h.id}>{stamp(h.attempted_at)} · {names(h.source_id)} · {h.schedule_date}<br/>{state(h.status)} · {h.showing_count}{h.error_message&&<code>{h.error_message}</code>}</p>)}</details>
    </>}
  </PageShell>;
}
