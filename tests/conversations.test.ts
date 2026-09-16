import test from 'node:test';
import assert from 'node:assert/strict';
import {saveConversation,parseArchive} from '../src/lib/conversations';
import type {ChatMessage} from '../src/types';
const message:ChatMessage={id:'one',role:'user',content:'Soalan pertama',timestamp:new Date(),citations:[{title:'Source',url:'https://example.test'}]};
test('new conversation preserves old messages and drafts without sharing context',()=>{
  const first=saveConversation(null,'one',[message],'draft');
  const next=saveConversation(first,'two',[],'');
  assert.equal(next.activeId,'two');assert.equal(next.conversations[0].messages.length,0);
  assert.deepEqual(next.conversations[1].messages,[message]);assert.equal(next.conversations[1].draft,'draft');
  const restored=parseArchive(JSON.stringify(next))!;
  assert.equal(restored.conversations[1].messages[0].timestamp.toISOString(),message.timestamp.toISOString());
  assert.deepEqual(restored.conversations[1].messages[0].citations,message.citations);
  const switched=saveConversation(restored,'one',restored.conversations[1].messages,'draft');
  assert.equal(switched.conversations.length,2);assert.equal(switched.activeId,'one');assert.equal(switched.conversations[0].title,'Soalan pertama');
});
test('invalid local history allows legacy session migration',()=>{
  assert.equal(parseArchive(null),null);assert.equal(parseArchive('{bad'),null);
  assert.equal(parseArchive(JSON.stringify({version:1,activeId:'missing',conversations:[]})),null);
});
