import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download, ExternalLink, Search } from 'lucide-react';
import { Button } from './Button';

type Article = { document_id: string; title: string; source_name: string; source_url: string; excerpt: string; content?: string; updated_at?: string };
export function Library() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(0);
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setArticle(null);
    const url = selectedId ? `/api/library/${encodeURIComponent(selectedId)}` : `/api/library?${new URLSearchParams({ q: search, source, page: String(page) })}`;
    fetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pustaka tidak dapat dimuatkan.');
      if (selectedId) setArticle(data.article);
      else { setArticles(data.articles); setSources(data.sources); setHasMore(data.hasMore); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, source, page, selectedId, retry]);

  return <section className="space-y-6">
    <div className="page-heading"><div><p className="eyebrow">ARTIKEL TERSIMPAN</p><h2>Pustaka</h2><p>Baca dan cari rujukan.</p></div><BookOpen className="h-7 w-7 text-emerald-700" /></div>
    {selectedId ? <Button onClick={() => setSelectedId(null)}><ArrowLeft /> Kembali ke pustaka</Button> :
      <form className="library-search" onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query.trim()); }}>
        <div className="search-field"><Search /><input aria-label="Cari artikel" placeholder="Cari tajuk atau kandungan…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <select aria-label="Tapis sumber" value={source} onChange={e => { setSource(e.target.value); setPage(0); }}><option value="">Semua sumber</option>{sources.map(name => <option key={name}>{name}</option>)}</select>
        <Button variant="primary" type="submit">Cari</Button>
      </form>}
    {loading ? <div role="status" className="empty-panel">Memuatkan pustaka…</div> : error ? <div role="alert" className="empty-panel"><p>{error}</p><Button onClick={() => setRetry(n => n + 1)}>Cuba lagi</Button></div> : selectedId && article ?
      <article className="article-reader"><p className="eyebrow">{article.source_name || 'Sumber lain'}</p><h3>{article.title}</h3><div className="flex flex-wrap gap-3 my-5">
        {article.source_url && <a className="ui-button ui-button--secondary" href={article.source_url} target="_blank" rel="noreferrer"><ExternalLink /> Sumber asal</a>}
        <a className="ui-button ui-button--secondary" href={`/api/library/${encodeURIComponent(article.document_id)}/download`}><Download /> Muat turun</a>
      </div><p className="text-sm text-stone-500 mb-5">Salinan tersimpan · belum disemak.</p><div className="whitespace-pre-wrap break-words leading-8 text-[15px]">{article.content}</div></article> : <>
      <p className="text-sm text-stone-500">Artikel tersimpan · Halaman {page + 1}</p>
      {articles.length === 0 ? <div className="empty-panel">Tiada artikel sepadan. Cuba kata kunci atau sumber lain.</div> : <div className="library-grid">{articles.map(item => <button className="article-card" key={item.document_id} onClick={() => setSelectedId(item.document_id)}><span className="eyebrow">{item.source_name || 'Sumber lain'}</span><h3>{item.title}</h3><p>{item.excerpt}</p><span className="article-action">Baca artikel <ArrowRight /></span></button>)}</div>}
      <div className="flex justify-between"><Button disabled={page === 0} onClick={() => setPage(n => n - 1)}><ArrowLeft /> Sebelumnya</Button><Button disabled={!hasMore} onClick={() => setPage(n => n + 1)}>Seterusnya <ArrowRight /></Button></div>
    </>}
  </section>;
}
