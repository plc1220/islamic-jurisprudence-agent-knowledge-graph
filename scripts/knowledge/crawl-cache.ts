import { hash, type Store } from './core';
export async function reuseOrCrawl<T>(url: string, alreadyStored: boolean, refresh: boolean, store: Store, crawl: () => Promise<T[]>) {
  if (alreadyStored && !refresh) return { status: 'known' as const, documents: [] as T[] };
  const key = `urls/${hash(url)}.json`;
  if (!refresh) {
    const cached = await store.read<{ documents: T[] }>(key);
    if (cached) return { status: 'cached' as const, documents: cached.documents };
  }
  const documents = await crawl();
  if (!documents.length) throw new Error('No crawlable content');
  // New URLs are checkpointed before embeddings/loading. Failed later stages never require recrawling.
  const result = refresh ? { documents } : await store.once(key, { documents });
  return { status: 'crawled' as const, documents: result.documents };
}
