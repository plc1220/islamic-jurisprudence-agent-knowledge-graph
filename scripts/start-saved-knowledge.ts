import dotenv from 'dotenv';
import {Storage} from '@google-cloud/storage';
import {GoogleAuth} from 'google-auth-library';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {CloudStore,PREFIX, type Release} from './knowledge/cloud';
import {changeUpdate,isRunning,type UpdateState} from './knowledge/update-flow';
dotenv.config({quiet:true});
async function main(){
 if(!process.argv.includes('--start')){console.log('Use --start to extract and publish the entire saved corpus through the deployed job. No crawling.');return;}
 const project=process.env.GCP_PROJECT_ID!;const bucket=process.env.KNOWLEDGE_PIPELINE_BUCKET||process.env.GCS_RAW_BUCKET!;
 const region=process.env.GCP_LOCATION||'asia-southeast1';const job=process.env.KNOWLEDGE_UPDATE_JOB||'mursyid-ai-knowledge-update';
 const store=new CloudStore(new Storage({projectId:project}),bucket,PREFIX);
 const current=await store.readVersioned<UpdateState>('update.json');
 if(isRunning(current?.value||null))throw new Error(`Update already running: ${current!.value.runId}`);
 const active=await store.read<Release>('active.json');const runId=`saved-${randomUUID()}`;
 const worker=await readFile(new URL('./saved-knowledge-worker.cjs',import.meta.url),'utf8');
 const now=new Date().toISOString();
 await store.compareAndSwap('update.json',{runId,phase:'queued',requestedAt:now,updatedAt:now,expectedActive:active?.version||null},current?.generation||0);
 try{
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
  const {data}=await auth.request<any>({url:`https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`,method:'POST',retry:false,timeout:30000,data:{overrides:{taskCount:1,containerOverrides:[{args:['--eval',worker],env:[{name:'KNOWLEDGE_RUN_ID',value:runId}]}]}}});
  await changeUpdate(store,runId,{operation:data.name});console.log(JSON.stringify({runId,operation:data.name,mode:'saved corpus only'}));
 }catch(error:any){await changeUpdate(store,runId,{phase:'dispatch-unknown',error:'Check job execution before retrying.'});throw error;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
