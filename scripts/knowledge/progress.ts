export type CrawlProgress = { position: number | null; total: number | null; url: string; updatedAt: string; detail: string };

// Entries arrive newest first. A processing log marks a started URL, not completion.
export function parseCrawlProgress(entries: Array<{ textPayload?: string; timestamp?: string }>): CrawlProgress | null {
  for (const entry of entries) {
    const text = entry.textPayload || '';
    const match = /^Processing (\d+)\/(\d+): (https?:\/\/\S+)/.exec(text);
    if (match && Number(match[2]) > 0 && Number(match[1]) <= Number(match[2])) {
      return { position: Number(match[1]), total: Number(match[2]), url: match[3], updatedAt: entry.timestamp || '', detail: 'Memproses sumber' };
    }
    if (/^(Discovering URLs for |Discovered \d+ URL\(s\) for )/.test(text)) {
      return { position: null, total: null, url: '', updatedAt: entry.timestamp || '', detail: text.slice(0, 300) };
    }
  }
  return null;
}
