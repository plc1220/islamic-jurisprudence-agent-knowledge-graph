import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from './Button';
type Source={id:number;name:string;url:string};
export function CrawlerPanel({onOpenUpdate}:{onOpenUpdate:()=>void}) {
  const [sources,setSources]=useState<Source[]>([]);const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/crawl-sources',{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Sumber tidak tersedia.');return r.json();}).then(d=>setSources(d.sources||[])).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
  return <section className="space-y-5"><div className="page-heading"><div><p className="eyebrow">URUS</p><h2>Sumber</h2><p>Halaman yang telah disimpan tidak diimbas semula.</p></div><Button onClick={onOpenUpdate}>Urus ilmu</Button></div>{error&&<p role="alert">{error}</p>}<div className="library-grid">{sources.map(source=><a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="article-card"><h3>{source.name}</h3><span className="article-action">Buka sumber <ExternalLink/></span></a>)}</div></section>;
}
