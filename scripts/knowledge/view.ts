export type GraphEvidence = { documentId: string; title: string; url: string; quote: string; statement: string; conditions: string; school: string; authority: string };
export function readEvidence(row: any): GraphEvidence | null {
  let metadata: any;
  try { metadata = JSON.parse(row.metadata_json || '{}'); } catch { return null; }
  const evidence = metadata.evidence;
  if (!evidence || typeof evidence.quote !== 'string' || !/^https?:\/\//i.test(row.source_url || '')) return null;
  const text = (value: any) => typeof value === 'string' ? value : '';
  return { documentId: text(row.document_id), title: text(metadata.title), url: row.source_url, quote: evidence.quote,
    statement: text(evidence.statement), conditions: text(evidence.conditions), school: text(evidence.school), authority: text(evidence.authority) };
}
export function buildGraphView(rows: any[]) {
  const nodes = new Map<string, { id: string; label: string; type: string; description: string; evidence: GraphEvidence[] }>();
  const links = new Map<string, { source: string; target: string; relation: string }>();
  for (const row of rows) {
    if (!row.source_id || !row.target_id) continue;
    const evidence = readEvidence(row);
    for (const side of ['source','target']) {
      const id = row[`${side}_id`];
      const node = nodes.get(id) || { id, label: row[`${side}_label`] || id, type: row[`${side}_type`] || 'Entity', description: row[`${side}_description`] || '', evidence: [] };
      if (evidence && node.evidence.length < 5 && !node.evidence.some(item => item.documentId === evidence.documentId && item.quote === evidence.quote)) node.evidence.push(evidence);
      nodes.set(id, node);
    }
    const link = { source: row.source_id, target: row.target_id, relation: row.relation || 'RELATION' };
    links.set(JSON.stringify(link),link);
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}
