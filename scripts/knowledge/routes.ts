import type { Express, Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { CloudStore, PREFIX, type Release } from './cloud';
import { MODEL } from './core';
import { adminCookie, checkSecret, isAdmin } from './admin';
import { changeUpdate, isRunning, type UpdateState } from './update-flow';
import { parseCrawlProgress, type CrawlProgress } from './progress';
import type { UsageSummary } from './usage';

export function registerKnowledgeRoutes(app: Express, overrides: { store?: CloudStore; request?: (method: 'GET' | 'POST', name: string, data?: unknown) => Promise<any>; readLogs?: (execution: string) => Promise<any[]> } = {}) {
  const project=process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  const region=process.env.GCP_LOCATION || 'asia-southeast1';
  const bucket=process.env.KNOWLEDGE_PIPELINE_BUCKET || process.env.GCS_RAW_BUCKET || '';
  const job=process.env.KNOWLEDGE_UPDATE_JOB || '';
  const secret=process.env.KNOWLEDGE_ADMIN_TOKEN || '';
  const enabled=Boolean(project && bucket && /^[a-z][a-z0-9-]*$/.test(job) && secret);
  const store=overrides.store || new CloudStore(new Storage({projectId:project}),bucket,PREFIX);
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const jobPath=`projects/${project}/locations/${region}/jobs/${job}`;
  const cloudRequest=async(method:'GET'|'POST',name:string,data?:unknown)=>{
    if(!name.startsWith(`projects/${project}/locations/${region}/`)) throw new Error('Invalid job resource');
    return (await (await auth.getClient()).request<any>({method,url:`https://run.googleapis.com/v2/${name}`,data,retry:false,timeout:15000})).data;
  };
  const request=overrides.request || cloudRequest;
  let crawlCache: { execution: string; expires: number; value: Promise<{ crawlProgress: CrawlProgress | null; progressUnavailable: boolean }> } | null = null;
  const readLogs=overrides.readLogs || (async(execution:string)=>{
    const result=await (await auth.getClient()).request<any>({method:'POST',url:'https://logging.googleapis.com/v2/entries:list',timeout:5000,retry:false,data:{
      resourceNames:[`projects/${project}`],
      filter:`resource.type="cloud_run_job" AND resource.labels.job_name=${JSON.stringify(job)} AND labels."run.googleapis.com/execution_name"=${JSON.stringify(execution)} AND (textPayload:"Processing " OR textPayload:"Discovering URLs for " OR textPayload:"Discovered ")`,
      orderBy:'timestamp desc',pageSize:5,
    }});
    return result.data.entries || [];
  });
  function crawlProgressFor(state:UpdateState) {
    const execution=state.execution?.startsWith(`${jobPath}/executions/`) ? state.execution.split('/').pop() : '';
    if(!execution) return Promise.resolve({crawlProgress:null,progressUnavailable:false});
    if(crawlCache?.execution===execution && crawlCache.expires>Date.now()) return crawlCache.value;
    const value=readLogs(execution).then(entries=>({crawlProgress:parseCrawlProgress(entries),progressUnavailable:false})).catch(error=>{
      console.warn('Crawl progress unavailable:',error.message);
      return {crawlProgress:null,progressUnavailable:true};
    });
    crawlCache={execution,expires:Date.now()+10000,value};
    return value;
  }
  const authorized=(req:Request)=>isAdmin(req.headers.cookie,secret);
  const sameOrigin=(req:Request)=>!req.headers.origin || req.headers.origin===`${req.protocol}://${req.get('host')}`;
  const requireAdmin=(req:Request,res:Response)=>{
    if(!enabled){res.status(503).json({error:'Kemas kini belum disediakan.'});return false;}
    if(!authorized(req) || !sameOrigin(req)){res.status(403).json({error:'Sila masuk sebagai admin.'});return false;}
    return true;
  };
  async function reconcile(state:UpdateState|null) {
    if(!state || !isRunning(state)) return state;
    if(state.operation && !state.execution){
      const op=await request('GET',state.operation);
      const execution=op.metadata?.name || op.response?.name;
      if(execution?.startsWith(`${jobPath}/executions/`)) state=await changeUpdate(store,state.runId,{execution});
      else if(op.done && op.error) return changeUpdate(store,state.runId,{phase:'failed',error:'Job could not start.'});
    }
    if(state.execution){
      const execution=await request('GET',state.execution);
      if(execution.completionTime){
        const latest=await store.read<UpdateState>('update.json');
        if(!latest || latest.runId!==state.runId || !isRunning(latest)) return latest;
        const active=await store.read<Release>('active.json');
        return changeUpdate(store,state.runId,active?.version===state.runId ? {phase:'complete'} : {phase:'failed',error:'Job ended before the graph was published. Retry to continue.'});
      }
    } else if(Date.now()-Date.parse(state.requestedAt)>120000){
      // Recover an ambiguous dispatch without sending the job a second time.
      let pageToken=''; let found:any;
      do {
        const list=await request('GET',`${jobPath}/executions?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}`:''}`);
        found=(list.executions||[]).find((execution:any)=>(execution.template?.containers||[]).some((container:any)=>container.args?.includes(state!.runId)));
        if(found) break;
        pageToken=list.nextPageToken||'';
      } while(pageToken);
      if(found) return changeUpdate(store,state.runId,{execution:found.name});
      const latest=await store.read<UpdateState>('update.json');
      if(latest?.runId===state.runId && ['queued','dispatch-unknown'].includes(latest.phase)) return changeUpdate(store,state.runId,{phase:'failed',error:'No job execution was created. Please retry.'});
    }
    return await store.read<UpdateState>('update.json');
  }
  app.post('/api/knowledge/login',(req,res)=>{
    if(!enabled) return res.status(503).json({error:'Kemas kini belum disediakan.'});
    if(!sameOrigin(req) || !checkSecret(req.body?.token,secret)) return res.status(403).json({error:'Kod admin tidak sah.'});
    res.setHeader('Set-Cookie',`mursyid_admin=${adminCookie(secret)}; HttpOnly; SameSite=Strict; Path=/api/knowledge; Max-Age=28800${process.env.NODE_ENV==='production' ? '; Secure':''}`);
    res.json({success:true});
  });
  app.get('/api/knowledge/status',async(req,res)=>{
    try {
      const admin=authorized(req);
      const state=enabled && admin ? await reconcile(await store.read<UpdateState>('update.json')) : null;
      const active=project && bucket ? await store.read<Release>('active.json') : null;
      const progress=state && ['extract','publish','failed'].includes(state.phase) ? await new CloudStore(store.storage,bucket,`${PREFIX}/runs/${state.runId}`).read('progress.json') : null;
      const crawl=state?.phase==='crawl' ? await crawlProgressFor(state) : {crawlProgress:null,progressUnavailable:false};
      const usage=state ? await store.read<UsageSummary>(`runs/${state.runId}/usage.json`) : null;
      res.setHeader('Cache-Control','no-store');
      res.json({enabled,admin,model:MODEL,active:active ? {version:active.version,documents:active.documents,edges:active.edges}:null,update:state ? {runId:state.runId,phase:state.phase,updatedAt:state.updatedAt,requestedAt:state.requestedAt,error:state.error,failedPhase:state.failedPhase,completedStages:state.completedStages,coverageWarnings:state.coverageWarnings}:null,progress,usage,...crawl,checkedAt:new Date().toISOString()});
    }catch(error:any){console.error('Knowledge status:',error.message);res.status(503).json({error:'Status tidak tersedia.'});}
  });
  app.post('/api/knowledge/update',async(req,res)=>{
    if(!requireAdmin(req,res))return;
    let runId='';
    try {
      const current=await store.readVersioned<UpdateState>('update.json');
      if(isRunning(current?.value||null)) return res.status(202).json({runId:current!.value.runId,existing:true});
      const active=await store.read<Release>('active.json');
      const resumable=current?.value.phase==='failed' && current.value.completedStages?.length && current.value.expectedActive===(active?.version || null);
      runId=resumable ? current!.value.runId : `update-${randomUUID()}`;
      const state:UpdateState={...(resumable ? current!.value : {}),runId,error:'',operation:undefined,execution:undefined,failedPhase:'',phase:'queued',requestedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),expectedActive:active?.version || null};
      await store.compareAndSwap('update.json',state,current?.generation || 0);
      const operation=await request('POST',`${jobPath}:run`,{overrides:{taskCount:1,containerOverrides:[{args:['dist/update-knowledge.cjs','--run-id',runId]}]}});
      // Worker may already have advanced the phase; merge just the operation name.
      await changeUpdate(store,runId,{operation:operation.name});
      res.status(202).json({runId});
    }catch(error:any){
      const code=Number(error.response?.status || error.code);
      if(code===412) return res.status(202).json({existing:true});
      if(runId){
        const latest=await store.read<UpdateState>('update.json').catch(()=>null);
        if(latest?.runId===runId && ['queued','dispatch-unknown'].includes(latest.phase)) await changeUpdate(store,runId,{phase:[400,401,403,404].includes(code)?'failed':'dispatch-unknown',error:'Dispatch could not be confirmed.'}).catch(()=>undefined);
      }
      console.error('Knowledge update dispatch:',error.message);
      res.status(503).json({error:'Status permintaan belum pasti. Semak status sebelum cuba lagi.'});
    }
  });
}
