// Operator entry point for extracting/publishing the saved corpus without crawling.
// Can be supplied verbatim through a Cloud Run Job node --eval argument.
const {Storage}=require('@google-cloud/storage');
const {spawn}=require('node:child_process');
const runId=process.env.KNOWLEDGE_RUN_ID;
const project=process.env.GCP_PROJECT_ID;
const bucket=process.env.KNOWLEDGE_PIPELINE_BUCKET||process.env.GCS_RAW_BUCKET;
const storage=new Storage({projectId:project});
const file=key=>storage.bucket(bucket).file(`knowledge-pipeline/${key}`);
async function read(key){try{return JSON.parse((await file(key).download())[0].toString());}catch(e){if(Number(e.code)===404)return null;throw e;}}
async function change(phase,error=''){
 for(let attempt=0;attempt<4;attempt++){
  const [metadata]=await file('update.json').getMetadata();
  const state=JSON.parse((await storage.bucket(bucket).file(file('update.json').name,{generation:metadata.generation}).download())[0].toString());
  if(state.runId!==runId)throw new Error('Update ownership changed');
  const execution=`projects/${project}/locations/${process.env.GCP_LOCATION}/jobs/${process.env.CLOUD_RUN_JOB}/executions/${process.env.CLOUD_RUN_EXECUTION}`;
  try{await file('update.json').save(JSON.stringify({...state,phase,error,execution,updatedAt:new Date().toISOString()}),{resumable:false,contentType:'application/json',preconditionOpts:{ifGenerationMatch:metadata.generation}});return state;}
  catch(e){if(Number(e.code)!==412||attempt===3)throw e;}
 }
}
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['dist/rebuild-graph.cjs',...args],{stdio:'inherit',env:process.env});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Graph pipeline exited ${code}`)));});}
(async()=>{
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(runId||''))throw new Error('Invalid run ID');
 const state=await read('update.json');if(state?.runId!==runId)throw new Error('Update ownership changed');
 if((await read('active.json'))?.version!==runId){
  await change('extract');await run(['run','--run-id',runId,'--all']);
  await change('publish');await run(['publish','--run-id',runId,'--expected-active',state.expectedActive||'legacy']);
 }
 if((await read('active.json'))?.version!==runId)throw new Error('Graph was not activated');
 await change('complete');console.log('Saved-corpus knowledge update complete');
})().catch(async error=>{console.error(error.message);await change('failed',String(error.message).slice(0,500)).catch(()=>{});process.exitCode=1;});
