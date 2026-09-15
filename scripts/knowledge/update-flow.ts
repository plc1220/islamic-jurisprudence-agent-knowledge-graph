import { type CloudStore, type Release } from './cloud';
export type UpdatePhase = 'queued' | 'dispatch-unknown' | 'crawl' | 'load' | 'extract' | 'publish' | 'complete' | 'failed';
export type UpdateState = { runId: string; phase: UpdatePhase; requestedAt: string; updatedAt: string; expectedActive: string | null; operation?: string; execution?: string; error?: string; completedStages?: string[]; failedPhase?: string; coverageWarnings?: string[] };
export const isRunning = (state: UpdateState | null) => Boolean(state && !['complete','failed'].includes(state.phase));
export async function changeUpdate(store: CloudStore, runId: string, patch: Partial<UpdateState>) {
  for (let attempt=0; attempt<4; attempt++) {
    const current = await store.readVersioned<UpdateState>('update.json');
    if (!current || current.value.runId !== runId) throw new Error('Update ownership changed');
    const next = {...current.value, ...patch, updatedAt:new Date().toISOString()};
    try { await store.compareAndSwap('update.json',next,current.generation);return next; }
    catch(error:any) { if(Number(error.code)!==412 || attempt===3) throw error; }
  }
  throw new Error('Could not checkpoint update state');
}
export async function runUpdate(store: CloudStore, runId: string, execute: (stage: 'crawl' | 'extract' | 'publish', state: UpdateState) => Promise<void>, execution?: string) {
  let state = await store.read<UpdateState>('update.json');
  if (!state || state.runId !== runId) throw new Error('This update is no longer current');
  if (state.phase === 'complete') return;
  if ((await store.read<Release>('active.json'))?.version === runId) { await changeUpdate(store,runId,{phase:'complete'}); return; }
  try {
    for (const phase of ['crawl','extract','publish'] as const) {
      if (state.completedStages?.includes(phase)) continue;
      state = await changeUpdate(store,runId,{phase,...(execution ? {execution} : {}),error:'',failedPhase:''});
      await execute(phase,state);
      state = await changeUpdate(store,runId,{completedStages:[...new Set([...(state.completedStages || []),phase])]});
    }
    const active = await store.read<Release>('active.json');
    if (active?.version !== runId) throw new Error('New graph was not activated');
    await changeUpdate(store,runId,{phase:'complete'});
  } catch(error:any) {
    await changeUpdate(store,runId,{phase:'failed',failedPhase:(await store.read<UpdateState>('update.json'))?.phase,error:String(error.message || 'Update failed').slice(0,1000)});
    throw error;
  }
}
