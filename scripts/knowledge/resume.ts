import { artifactKeys } from './demo';
import type { Document } from './core';
/** Inventory object names once. Fully saved documents never enter the extraction queue. */
export function planResume<T extends Document>(documents:T[], available:Set<string>) {
  const saved:T[]=[], pending:T[]=[];
  for(const document of documents){
    const keys=artifactKeys(document);
    (keys.length && keys.every(key=>available.has(key)) ? saved : pending).push(document);
  }
  return {saved,pending};
}
