import { fingerprint, hash, splitSections, type Document } from './core';
export function artifactKeys(document: Document): string[] {
  return splitSections(document.content || '').map(section => `documents/${hash(document.document_id)}/${hash(document.content)}/${fingerprint()}/sections/${section.index}.json`);
}
/** Deterministic round-robin selection across sources; only fully checkpointed documents qualify. */
export function selectCachedDocuments<T extends Document>(documents: T[], available: Set<string>, limit: number): T[] {
  const groups = new Map<string, T[]>();
  for (const document of [...documents].sort((a,b)=>a.document_id.localeCompare(b.document_id))) {
    const keys = artifactKeys(document);
    if (!keys.length || !keys.every(key=>available.has(key))) continue;
    const group = groups.get(document.source_name) || [];
    group.push(document); groups.set(document.source_name,group);
  }
  const selected:T[]=[];
  const sources=[...groups.keys()].sort();
  for(let index=0; selected.length<limit; index++) {
    let added=false;
    for(const source of sources) {
      const document=groups.get(source)![index];
      if(document){selected.push(document);added=true;}
      if(selected.length===limit) break;
    }
    if(!added) break;
  }
  if(selected.length!==limit) throw new Error(`Only ${selected.length} fully saved documents available; need ${limit}. No extraction was started.`);
  return selected;
}
