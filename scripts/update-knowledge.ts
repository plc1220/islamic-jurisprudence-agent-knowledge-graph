import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import { spawn } from 'node:child_process';
import { CloudStore, PREFIX } from './knowledge/cloud';
import { runUpdate } from './knowledge/update-flow';
dotenv.config({quiet:true});
async function main() {
  const index=process.argv.indexOf('--run-id');
  if(index<0 || process.argv.includes('--help')) {console.log('Worker for the admin Update knowledge action. Requires --run-id ID registered by the app. No work runs without an ID.');return;}
  const runId=process.argv[index+1];
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(runId||'')) throw new Error('Invalid run ID');
  const project=process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  const bucket=process.env.KNOWLEDGE_PIPELINE_BUCKET || process.env.GCS_RAW_BUCKET || '';
  if(!project || !bucket) throw new Error('Configure project and pipeline bucket');
  const store=new CloudStore(new Storage({projectId:project}),bucket,PREFIX);
  const built=process.argv[1].endsWith('.cjs');
  const run = (script:string,args:string[],env:Record<string,string>={}) => new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,built ? [`dist/${script}.cjs`,...args] : ['--import','tsx',`scripts/${script}.ts`,...args],{stdio:'inherit',env:{...process.env,...env}});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0 ? resolve() : reject(new Error(`${script} failed (${signal || code})`)));
  });
  const execution=process.env.CLOUD_RUN_EXECUTION ? `projects/${project}/locations/${process.env.GCP_LOCATION || 'asia-southeast1'}/jobs/${process.env.CLOUD_RUN_JOB}/executions/${process.env.CLOUD_RUN_EXECUTION}` : undefined;
  await runUpdate(store,runId,async(stage,state)=>{
    if(stage==='crawl') await run('backfill',[],{BACKFILL_RESUME_RUN_ID:runId,BACKFILL_EXTRACT_GRAPH:'false',BACKFILL_PUBLISH_CATALOG:'false',BACKFILL_REFRESH_EXISTING:'false',BACKFILL_DRY_RUN:'false',BACKFILL_URL_LIMIT:'0',BACKFILL_SOURCE_IDS:'all'});
    if(stage==='extract') await run('rebuild-graph',['run','--run-id',runId,'--all']);
    if(stage==='publish') await run('rebuild-graph',['publish','--run-id',runId,'--expected-active',state.expectedActive || 'legacy']);
  },execution);
}
main().catch(error=>{console.error(String(error.message || 'Update failed'));process.exitCode=1;});
