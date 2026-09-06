import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';
type Status = { enabled:boolean;admin:boolean;model:string;active:{version:string;documents:number;edges:number}|null;update:{runId:string;phase:string}|null;progress?:{completed:number;documents:number;failed:number} };
const labels:Record<string,string>={queued:'Dalam giliran', 'dispatch-unknown':'Menyemak status',crawl:'Menyemak sumber',extract:'Menyusun ilmu',publish:'Menerbitkan graf',complete:'Selesai',failed:'Kemas kini terhenti'};
export function CurationPlan({onComplete}:{onComplete?:()=>void}) {
  const [status,setStatus]=useState<Status|null>(null);
  const [token,setToken]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [poll,setPoll]=useState(0);
  const notified=useRef('');
  const running=Boolean(status?.update && !['complete','failed'].includes(status.update.phase));
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/knowledge/status',{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setStatus(data);})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message||'Status tidak tersedia.');});
    return()=>controller.abort();
  },[poll]);
  useEffect(()=>{if(!running)return;const timer=setTimeout(()=>setPoll(p=>p+1),5000);return()=>clearTimeout(timer);},[running,poll]);
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
      {running && status?.progress && <p role="status" className="text-sm">{status.progress.completed} / {status.progress.documents} artikel</p>}
      {status?.active && <div className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4"/>{status.active.documents} artikel · {status.active.edges} hubungan</div>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <Button variant="ghost" disabled={busy} onClick={()=>{setError('');setPoll(p=>p+1);}}>Semak status</Button>
    </div>
  </section>;
}
