import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsageTracker, tokenCounts, emptyUsage, addUsage, type UsageCall, type UsageSummary } from '../scripts/knowledge/usage';
import { TokenUsage } from '../src/components/TokenUsage';
const at='2026-09-14T07:00:00.000Z';
const call=(id:string,attempt=1):UsageCall=>({id,model:'fixture-model',documentId:'fixture-doc',section:0,attempt,at,requestFailed:false,tokens:tokenCounts({promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:10,cachedContentTokenCount:40,totalTokenCount:130})});

test('token totals use reported totals without double counting cached input or thinking',()=>{
 const s=addUsage(addUsage(emptyUsage('fixture-model',at),call('one')),call('two',2));
 assert.equal(s.tokens.totalTokenCount,260);assert.equal(s.tokens.promptTokenCount,200);assert.equal(s.tokens.cachedContentTokenCount,80);
 assert.equal(s.tokens.thoughtsTokenCount,20);assert.equal(s.calls,2);assert.equal(s.retries,1);
 assert.equal(s.tokens.toolUsePromptTokenCount,null);
});
test('missing, invalid and zero token metadata remain distinguishable',()=>{
 assert.equal(tokenCounts({totalTokenCount:0}).totalTokenCount,0);
 assert.equal(tokenCounts({totalTokenCount:-1}).totalTokenCount,null);
 assert.equal(tokenCounts({totalTokenCount:NaN}).totalTokenCount,null);
 const s=addUsage(addUsage(emptyUsage('fixture-model',at),call('one')),{...call('failed',2),requestFailed:true,tokens:tokenCounts(undefined)});
 assert.equal(s.missingUsageCalls,1);assert.equal(s.failedRequests,1);assert.equal(s.tokens.totalTokenCount,130);assert.equal(s.reportedCalls.totalTokenCount,1);
});
test('durable call ledger recovers a lost summary and deduplicates replay on resume',async()=>{
 const calls=new Map<string,UsageCall>();let summary:UsageSummary|undefined;let failSummary=false;
 const ledger={list:async()=>[...calls.values()],saveCall:async(c:UsageCall)=>{if(!calls.has(c.id))calls.set(c.id,c);return calls.get(c.id)!;},saveSummary:async(s:UsageSummary)=>{if(failSummary)throw new Error('Interrupted summary write');summary=s;}};
 const tracker=new UsageTracker(ledger,'fixture-model',at);await tracker.load();await tracker.record(call('one'));await tracker.record(call('one'));
 assert.equal(summary?.calls,1);failSummary=true;await assert.rejects(tracker.record(call('two',2)));assert.equal(calls.size,2);
 failSummary=false;const resumed=new UsageTracker(ledger,'fixture-model',at);await resumed.load();
 assert.equal(summary?.calls,2);assert.equal(summary?.tokens.totalTokenCount,260);assert.equal(summary?.retries,1);
 await resumed.record(call('three'));assert.equal(summary?.tokens.totalTokenCount,390);
});
test('no Gemini calls on checkpoint reuse means no new usage',async()=>{
 const {processDocument}=await import('../scripts/knowledge/core');
 const cache=new Map<string,any>();const store={read:async<T>(k:string)=>cache.get(k) as T??null,once:async<T>(k:string,v:T)=>{if(!cache.has(k))cache.set(k,v);return cache.get(k) as T;}};
 let calls=0;const extract=async()=>{calls++;return {kind:'unrelated',reason:'Synthetic fixture',nodes:[],claims:[]};};
 const document={document_id:'fixture',title:'Fixture',source_url:'https://example.test',source_name:'Fixture',content:'Synthetic source text unrelated to graph.'};
 await processDocument(document,store,extract);await processDocument(document,store,extract);assert.equal(calls,1);
});
test('token UI distinguishes historical missing data and partial reported totals',()=>{
 const missing=renderToStaticMarkup(React.createElement(TokenUsage,{usage:null}));assert.match(missing,/penggunaan terdahulu tidak dianggap sifar/);
 const summary=addUsage(addUsage(emptyUsage('fixture-model',at),call('one')),{...call('two'),tokens:tokenCounts(undefined)});
 const html=renderToStaticMarkup(React.createElement(TokenUsage,{usage:summary}));
 assert.match(html,/Input daripada cache/);assert.match(html,/tidak lengkap/);assert.match(html,/Tidak dilaporkan/);assert.match(html,/130/);
});
