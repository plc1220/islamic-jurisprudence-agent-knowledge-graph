import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';
import { TokenUsage } from './TokenUsage';
import type { UsageSummary } from '../../scripts/knowledge/usage';
type Status = { enabled:boolean;admin:boolean;model:string;active:{version:string;documents:number;edges:number}|null;update:{runId:string;phase:string;requestedAt?:string;error?:string;failedPhase?:string;coverageWarnings?:string[]}|null;progress?:{completed:number;documents:number;failed:number;reused?:number;newlyCompleted?:number;remaining?:number;pendingAtStart?:number;stage?:string;assembled?:number};crawlProgress?:{position:number|null;total:number|null;url:string;updatedAt:string;detail:string};progressUnavailable?:boolean;checkedAt?:string;usage?:UsageSummary|null };
const labels:Record<string,string>={queued:'Dalam giliran', 'dispatch-unknown':'Menyemak status',crawl:'Menyemak sumber',load:'Memuatkan indeks',extract:'Menyusun ilmu',publish:'Menerbitkan graf',complete:'Selesai',failed:'Kemas kini terhenti'};
export function CurationPlan({onComplete}:{onComplete?:()=>void}) {
  const [status,setStatus]=useState<Status|null>(null);
  const [token,setToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [poll,setPoll]=useState(0);
  const [checking,setChecking]=useState(false);
  const notified=useRef('');
  const running=Boolean(status?.update && !['complete','failed'].includes(status.update.phase));
  useEffect(()=>{
    const controller=new AbortController();
    setChecking(true);
    fetch('/api/knowledge/status',{signal:controller.signal,cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted){setStatus(data);setError('');}})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message||'Status tidak tersedia.');})
      .finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    return()=>controller.abort();
  },[poll]);
  useEffect(()=>{if(!running || checking)return;const timer=setTimeout(()=>setPoll(p=>p+1),5000);return()=>clearTimeout(timer);},[running,poll,checking]);
  useEffect(()=>{if(status?.update?.phase==='complete' && notified.current!==status.update.runId){notified.current=status.update.runId;onComplete?.();}},[status,onComplete]);
  async function action(url:string,body:unknown){
    setBusy(true);setError('');
    try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Permintaan gagal.');if(url.endsWith('/login'))setToken('');}
    catch(err:any){setError(err.message);}
    finally{setBusy(false);setPoll(p=>p+1);}
  }
  return <section className="space-y-6">
    <div className="page-heading"><div><p className="eyebrow">URUS</p><h2>Ilmu</h2><p>Sumber → isi → graf</p></div></div>
    <div className="article-reader space-y-5">
      <div className="flex items-center justify-between gap-4"><strong>Gemini 3.7 Flash</strong><span className="text-sm text-stone-500">{status?.update ? labels[status.update.phase] : 'Sedia'}</span></div>
      <p className="text-sm text-stone-500">Tambah yang baharu. Guna semula yang sama.</p>
      {!status ? <p role="status">Memuatkan…</p> : !status.enabled ? <p>Kemas kini belum disediakan.</p> : !status.admin ? <form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void action('/api/knowledge/login',{token});}}><input type="password" aria-label="Kod admin" placeholder="Kod admin" autoComplete="current-password" value={token} onChange={e=>setToken(e.target.value)} className="border border-stone-200 rounded-lg px-3 py-2"/><Button type="submit" disabled={busy||!token}>Masuk</Button></form> : <Button variant="primary" disabled={busy||running} onClick={()=>void action('/api/knowledge/update',{})}><RefreshCw className={running?'animate-spin':''}/>{running?'Sedang dikemas kini…':status.update?.phase==='failed'?'Cuba lagi':'Kemas kini'}</Button>}
      {status?.progress && <div role="status" className="space-y-2 text-sm">
        <p>{status.progress.completed.toLocaleString()} / {status.progress.documents.toLocaleString()} dokumen tersimpan</p>
        {status.progress.reused !== undefined && <>
          <p>Guna semula: {status.progress.reused.toLocaleString()} · Baharu selesai: {(status.progress.newlyCompleted || 0).toLocaleString()} · Belum selesai: {(status.progress.remaining ?? 0).toLocaleString()}</p>
          <p>Perlu dicuba lagi: {status.progress.failed.toLocaleString()}</p>
          {status.progress.stage==='assemble' ? <p>Menyediakan graf daripada hasil tersimpan: {(status.progress.assembled || 0).toLocaleString()} / {status.progress.documents.toLocaleString()}. Tiada pengekstrakan Gemini pada peringkat ini.</p> : <p>Hanya dokumen belum selesai diproses. Bahagian yang tersimpan digunakan semula.</p>}
        </>}
      </div>}
      {running && status?.crawlProgress && <div className="space-y-2 text-sm" role="status">
        {status.crawlProgress.position!==null && status.crawlProgress.total ? <>
          <p>Memproses URL {status.crawlProgress.position.toLocaleString()} daripada {status.crawlProgress.total.toLocaleString()}</p>
          <progress className="w-full accent-emerald-700" aria-label="Kedudukan URL dalam senarai sumber" value={status.crawlProgress.position} max={status.crawlProgress.total}/>
          <p className="text-stone-500">Kedudukan dalam senarai sumber, bukan jumlah yang selesai.</p>
        </> : <p>Mencari halaman sumber…</p>}
        {status.crawlProgress.url && <p className="break-all text-stone-500">{status.crawlProgress.url}</p>}
        {status.crawlProgress.updatedAt && <p className="text-stone-500">Aktiviti terakhir: {new Date(status.crawlProgress.updatedAt).toLocaleString('ms-MY')}</p>}
      </div>}
      {running && status?.update?.phase==='crawl' && !status.crawlProgress && <p className="text-sm text-stone-500">{status.progressUnavailable?'Butiran kemajuan tidak dapat dibaca. Status tugas masih tersedia.':'Menunggu laporan kemajuan sumber…'}</p>}
      {running && <p className="text-sm text-stone-500">Sumber → Susun ilmu → Terbitkan graf. Graf sedia ada kekal sehingga penerbitan selesai.</p>}
      {status?.active && <div className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4"/>{status.active.documents} artikel · {status.active.edges} hubungan</div>}
      {status?.admin && status.update && <TokenUsage usage={status.usage ?? null}/>}
      {status?.update?.phase==='failed' && <div role="alert" className="text-sm text-rose-700"><p>Kemas kini gagal pada peringkat: {labels[status.update.failedPhase || ''] || status.update.failedPhase || 'Tidak diketahui'}.</p><p className="break-words">{status.update.error || 'Semak log tugas untuk butiran.'}</p></div>}
      {status?.update?.coverageWarnings?.map(warning=><p key={warning} className="text-sm text-amber-800">{warning}</p>)}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {status?.checkedAt && <p className="text-xs text-stone-500">Disemak: {new Date(status.checkedAt).toLocaleTimeString('ms-MY')}{running?' · Semakan automatik setiap 5 saat':''}</p>}
      <Button variant="ghost" disabled={busy||checking} onClick={()=>{setError('');setPoll(p=>p+1);}}><RefreshCw className={checking?'animate-spin':''}/>{checking?'Menyemak…':'Semak status'}</Button>
    </div>
  </section>;
}
