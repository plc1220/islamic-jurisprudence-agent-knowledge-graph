import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, fingerprint, hash, splitSections, validateExtraction, processDocument, graphRows, canActivate, canonicalId, type Document, type Store } from '../scripts/knowledge/core';
import { tableFor, validateRelease, CloudStore } from '../scripts/knowledge/cloud';

// Synthetic, non-domain fixtures only. These never leave the test process.
const text = 'Object Alpha connects to object Beta only in test context C.';
const doc: Document = { document_id:'fixture', title:'Synthetic fixture', source_url:'https://example.test/fixture', source_name:'Fixture', content:text };
const raw = () => ({ kind:'article', reason:'Synthetic test', nodes:[
  { id:'a', type:'Konsep', label:'Alpha', description:'Test object', scope:'' },
  { id:'b', type:'Konsep', label:'Beta', description:'Test object', scope:'' },
], claims:[{source:'a',target:'b',relation:'connects',statement:text,quote:text,conditions:'test context C',school:'',authority:''}] });
class MemoryStore implements Store {
  values = new Map<string, any>();
  async read<T>(key: string): Promise<T | null> { return this.values.has(key) ? structuredClone(this.values.get(key)) : null; }
  async once<T>(key: string, value: T): Promise<T> { if (!this.values.has(key)) this.values.set(key, structuredClone(value)); return this.read<T>(key) as Promise<T>; }
}

test('all source text is covered beyond the old 9000-character cutoff', () => {
  const content = '😀'.repeat(10000) + 'END';
  const sections = splitSections(content);
  assert.ok(sections.length > 3);
  assert.equal(sections[0].start,0);
  assert.equal(sections.at(-1)?.end,content.length);
  for (const [i,s] of sections.entries()) {
    assert.equal(s.text, content.slice(s.start,s.end));
    assert.ok(!/^[\uDC00-\uDFFF]/.test(s.text));
    if (i) assert.ok(s.start <= sections[i-1].end && s.end > sections[i-1].end);
  }
  assert.throws(()=>splitSections(content,100,100));
});

test('validates exact quotes, preserves qualifications and rejects hallucinated evidence/endpoints', () => {
  const section=splitSections(text)[0];
  const result=validateExtraction(raw(),doc,section);
  assert.equal(doc.content.slice(result.claims[0].start,result.claims[0].end),text);
  assert.equal(result.claims[0].conditions,'test context C');
  const missing=raw(); missing.claims[0].quote='This text never occurs in the source.';
  assert.throws(()=>validateExtraction(missing,doc,section),/absent/);
  const dangling=raw(); dangling.claims[0].target='unknown';
  assert.throws(()=>validateExtraction(dangling,doc,section),/Dangling/);
  const excluded=raw(); excluded.kind='listing';
  assert.throws(()=>validateExtraction(excluded,doc,section),/Excluded/);
});

test('identity normalization handles capitalization but keeps context separate',()=>{
  const node=raw().nodes[0];
  assert.equal(canonicalId(node),canonicalId({...node,label:' ALPHA '}));
  assert.notEqual(canonicalId(node),canonicalId({...node,scope:'Different context'}));
});

test('resume skips completed extraction and changed source invalidates checkpoint',async()=>{
  const store=new MemoryStore(); let calls=0;
  const extract=async()=>{calls++;return raw();};
  const first=await processDocument(doc,store,extract);
  const again=await processDocument(doc,store,extract);
  assert.equal(calls,1); assert.deepEqual(first,again);
  await processDocument({...doc,content:text+' Extra text.'},store,extract);
  assert.equal(calls,2);
  const rows=graphRows(doc,first,'fixture-run','2026-09-06T00:00:00.000Z');
  assert.equal(rows.length,1);assert.equal(rows[0].content_hash,hash(text));
  const metadata=JSON.parse(rows[0].metadata_json);
  assert.equal(metadata.model,'gemini-3.7-flash');assert.equal(metadata.evidence.quote,text);
  assert.equal(metadata.reviewStatus,'machine-extracted');
});

test('interruption resumes only missing sections, not the corpus crawler',async()=>{
  const store=new MemoryStore(); const longDoc={...doc,content:'x'.repeat(14000)};
  let calls=0;
  const empty={kind:'uncertain',reason:'Synthetic test',nodes:[],claims:[]};
  await assert.rejects(processDocument(longDoc,store,async()=>{if(++calls===2)throw new Error('interrupted');return empty;}));
  let resumed=0;
  const results=await processDocument(longDoc,store,async()=>{resumed++;return empty;});
  assert.equal(resumed,splitSections(longDoc.content).length-1);
  assert.equal(results.length,splitSections(longDoc.content).length);
});

test('corrupt checkpoint fails closed rather than silently skipping missing graph work',async()=>{
  const store=new MemoryStore();await processDocument(doc,store,async()=>raw());
  const entry=[...store.values.keys()][0];store.values.get(entry).claims[0].start=3;
  await assert.rejects(processDocument(doc,store,async()=>raw()),/corrupted/);
});

test('publication rejects failures, empty graphs and an unexpected active version',()=>{
  const ready={edges:1,documents:1,completed:1,failed:0,fingerprint:fingerprint()};
  assert.doesNotThrow(()=>canActivate(ready,null,null));
  assert.throws(()=>canActivate({...ready,failed:1},null,null));
  assert.throws(()=>canActivate({...ready,edges:0},null,null));
  assert.throws(()=>canActivate({...ready,completed:0},null,null));
  assert.throws(()=>canActivate(ready,'old','new'),/changed/);
  const release={...ready,version:'fixture-run',table:tableFor('fixture-run'),model:MODEL,reviewStatus:'machine-extracted',sections:1,excludedSections:0,uncertainSections:0,preparedAt:'now'};
  assert.doesNotThrow(()=>validateRelease(release));
  assert.throws(()=>validateRelease({...release,table:'corpus'}));
  assert.throws(()=>validateRelease({...release,model:'different-model'}));
});

test('GCS checkpoints use create-only writes, publisher uses generation preconditions',async()=>{
  const saved: any[]=[];
  const fake:any={bucket:()=>({file:()=>({save:async(value:any,options:any)=>saved.push({value,options})})})};
  const store=new CloudStore(fake,'fixture','test');
  await store.once('part.json',{a:1});await store.compareAndSwap('active.json',{b:2},'123');
  assert.equal(saved[0].options.preconditionOpts.ifGenerationMatch,0);
  assert.equal(saved[1].options.preconditionOpts.ifGenerationMatch,'123');
});

import { reuseOrCrawl } from '../scripts/knowledge/crawl-cache';
import { runUpdate, type UpdateState } from '../scripts/knowledge/update-flow';
import { adminCookie, checkSecret, isAdmin } from '../scripts/knowledge/admin';
import { registerKnowledgeRoutes } from '../scripts/knowledge/routes';
import { buildGraphView } from '../scripts/knowledge/view';
import express from 'express';

class VersionedMemory extends MemoryStore {
  revisions = new Map<string,number>();
  async readVersioned<T>(key:string){const value=await this.read<T>(key);return value===null?null:{value,generation:String(this.revisions.get(key)||0)};}
  async compareAndSwap<T>(key:string,value:T,generation:string|number){
    const revision=this.revisions.get(key)||0;
    if(Number(generation)!==revision)throw Object.assign(new Error('conflict'),{code:412});
    this.values.set(key,structuredClone(value));this.revisions.set(key,revision+1);
  }
}
const updateState=():UpdateState=>({runId:'fixture-update',phase:'queued',requestedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),expectedActive:null});

test('known URLs never call crawler; interrupted new URL reuses saved crawl',async()=>{
  const store=new MemoryStore();let calls=0;const crawl=async()=>{calls++;return [{content:'Synthetic source'}];};
  assert.equal((await reuseOrCrawl('https://example.test/a',true,false,store,crawl)).status,'known');
  assert.equal(calls,0);
  await reuseOrCrawl('https://example.test/b',false,false,store,crawl);
  const resumed=await reuseOrCrawl('https://example.test/b',false,false,store,crawl);
  assert.equal(resumed.status,'cached');assert.equal(calls,1);
});

test('a later graph version reuses extraction artifacts without model calls',async()=>{
  const artifacts=new MemoryStore();let calls=0;const extractor=async()=>{calls++;return raw();};
  const first=graphRows(doc,await processDocument(doc,artifacts,extractor),'version-one','now');
  const second=graphRows(doc,await processDocument(doc,artifacts,extractor),'version-two','later');
  assert.equal(calls,1);assert.equal(first[0].edge_id,second[0].edge_id);
  assert.notEqual(first[0].crawl_batch_id,second[0].crawl_batch_id);
});

test('one update runs crawl -> extraction -> publish, failure never publishes',async()=>{
  const store=new VersionedMemory();await store.compareAndSwap('update.json',updateState(),0);
  const stages:string[]=[];
  await runUpdate(store as any,'fixture-update',async stage=>{stages.push(stage);if(stage==='publish')store.values.set('active.json',{version:'fixture-update'});});
  assert.deepEqual(stages,['crawl','extract','publish']);
  assert.equal((await store.read<UpdateState>('update.json'))?.phase,'complete');
  const failed=new VersionedMemory();await failed.compareAndSwap('update.json',updateState(),0);
  const attempted:string[]=[];
  await assert.rejects(runUpdate(failed as any,'fixture-update',async stage=>{attempted.push(stage);if(stage==='extract')throw new Error('model unavailable');}));
  assert.deepEqual(attempted,['crawl','extract']);assert.equal(await failed.read('active.json'),null);
  assert.equal((await failed.read<UpdateState>('update.json'))?.phase,'failed');
});

test('admin credentials reject forgery and expiration',()=>{
  const secret='test-only-secret';const cookie=adminCookie(secret,1000);
  assert.ok(isAdmin('mursyid_admin='+cookie,secret,1001));
  assert.ok(!isAdmin('mursyid_admin='+cookie+'forged',secret,1001));
  assert.ok(!isAdmin('mursyid_admin='+cookie,secret,1000+9*3600000));
  assert.ok(!checkSecret('wrong',secret));assert.ok(checkSecret(secret,secret));
});

test('graph deduplication retains evidence from multiple documents',()=>{
  const result=validateExtraction(raw(),doc,splitSections(text)[0]);const rows=graphRows(doc,[result],'fixture-run','now');
  const graph=buildGraphView([...rows,{...rows[0],document_id:'second-fixture'}]);
  assert.equal(graph.links.length,1);assert.equal(graph.nodes[0].evidence.length,2);
  assert.equal(graph.nodes[0].evidence[0].quote,text);
});

test('admin HTTP action dispatches once; unauthorized callers cannot launch a job',async()=>{
  const keys=['GCP_PROJECT_ID','GCP_LOCATION','GCS_RAW_BUCKET','KNOWLEDGE_UPDATE_JOB','KNOWLEDGE_ADMIN_TOKEN'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{GCP_PROJECT_ID:'fixture-project',GCP_LOCATION:'fixture-region',GCS_RAW_BUCKET:'fixture-bucket',KNOWLEDGE_UPDATE_JOB:'fixture-job',KNOWLEDGE_ADMIN_TOKEN:'test-secret'});
  const store=new VersionedMemory();let calls=0;
  const app=express();app.use(express.json());
  registerKnowledgeRoutes(app,{store:store as any,request:async(method,name,data)=>{
    assert.equal(method,'POST');assert.ok(name.endsWith(':run'));calls++;
    assert.equal((data as any).overrides.taskCount,1);
    assert.equal((data as any).overrides.containerOverrides[0].args[0],'dist/update-knowledge.cjs');
    return {name:'projects/fixture-project/locations/fixture-region/operations/fixture'};
  }});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    assert.equal((await fetch(url+'/api/knowledge/update',{method:'POST'})).status,403);assert.equal(calls,0);
    const login=await fetch(url+'/api/knowledge/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'test-secret'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const results=await Promise.all([1,2].map(()=>fetch(url+'/api/knowledge/update',{method:'POST',headers:{Cookie:cookie}})));
    assert.ok(results.every(r=>r.status===202));assert.equal(calls,1);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});

import { parseCrawlProgress } from '../scripts/knowledge/progress';
test('crawl progress distinguishes starting a URL from completion and handles discovery',()=>{
  const p=parseCrawlProgress([{textPayload:'Processing 125/5223: https://example.test/a',timestamp:'2026-09-14T06:41:28Z'}]);
  assert.equal(p?.position,125);assert.equal(p?.total,5223);assert.equal(p?.updatedAt,'2026-09-14T06:41:28Z');
  assert.equal(parseCrawlProgress([{textPayload:'Discovering URLs for Fixture (https://example.test).'}])?.position,null);
  assert.equal(parseCrawlProgress([{textPayload:'Processing 2/0: https://example.test/a'}]),null);
  assert.equal(parseCrawlProgress([{textPayload:'Processing 20/10: https://example.test/a'}]),null);
  assert.equal(parseCrawlProgress([]),null);
});

test('status exposes cached progress only to admins and refreshes when execution changes',async()=>{
  const keys=['GCP_PROJECT_ID','GCP_LOCATION','GCS_RAW_BUCKET','KNOWLEDGE_UPDATE_JOB','KNOWLEDGE_ADMIN_TOKEN'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{GCP_PROJECT_ID:'fixture-project',GCP_LOCATION:'fixture-region',GCS_RAW_BUCKET:'fixture-bucket',KNOWLEDGE_UPDATE_JOB:'fixture-job',KNOWLEDGE_ADMIN_TOKEN:'test-secret'});
  const store=new VersionedMemory();let calls=0;let fail=false;
  const execution='projects/fixture-project/locations/fixture-region/jobs/fixture-job/executions/fixture-one';
  store.values.set('update.json',{...updateState(),phase:'crawl',execution});
  store.values.set('runs/fixture-update/usage.json',{calls:2,tokens:{totalTokenCount:260}});
  const app=express();
  registerKnowledgeRoutes(app,{store:store as any,request:async(method)=>{assert.equal(method,'GET');return {};},readLogs:async(name)=>{
    calls++;assert.ok(name.startsWith('fixture-'));if(fail)throw new Error('Unavailable');
    return [{textPayload:'Processing 125/5223: https://example.test/a',timestamp:'2026-09-14T06:41:28Z'}];
  }});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/knowledge/status`;
  const headers={Cookie:`mursyid_admin=${adminCookie('test-secret')}`};
  try {
    const publicStatus=await (await fetch(url)).json();
    assert.equal(publicStatus.crawlProgress,null);assert.equal(publicStatus.usage,null);assert.equal(calls,0);
    const results=await Promise.all([fetch(url,{headers}),fetch(url,{headers})]);
    for(const r of results){assert.equal(r.headers.get('cache-control'),'no-store');const data=await r.json();assert.equal(data.crawlProgress.position,125);assert.equal(data.usage.tokens.totalTokenCount,260);assert.ok(data.checkedAt);}
    assert.equal(calls,1);
    store.values.set('update.json',{...updateState(),phase:'crawl',execution:execution.replace('fixture-one','fixture-two')});fail=true;
    const degraded=await (await fetch(url,{headers})).json();
    assert.equal(calls,2);assert.equal(degraded.update.phase,'crawl');assert.equal(degraded.progressUnavailable,true);
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});
