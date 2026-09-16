import type { ChatMessage } from '../types';
export const CONVERSATIONS_KEY = 'mursyid.conversations.v1';
export type Conversation = {id:string;title:string;updatedAt:string;messages:ChatMessage[];draft:string};
export type ConversationArchive = {version:1;activeId:string;conversations:Conversation[]};
export function parseArchive(raw:string|null):ConversationArchive|null {
  if(!raw) return null;
  try {
    const value=JSON.parse(raw);
    if(value.version!==1 || !Array.isArray(value.conversations) || typeof value.activeId!=='string') return null;
    const conversations:Conversation[]=value.conversations.filter((c:any)=>typeof c?.id==='string' && typeof c.title==='string' && Array.isArray(c.messages)).map((c:any)=>({...c,draft:typeof c.draft==='string'?c.draft:'',messages:c.messages.filter((m:any)=>m && typeof m.content==='string' && ['user','model','system'].includes(m.role)).map((m:any)=>({...m,timestamp:new Date(m.timestamp)})).filter((m:ChatMessage)=>!Number.isNaN(m.timestamp.getTime()))}));
    if(!conversations.some(c=>c.id===value.activeId)) return null;
    return {version:1,activeId:value.activeId,conversations};
  } catch {return null;}
}
export function saveConversation(archive:ConversationArchive|null,id:string,messages:ChatMessage[],draft:string):ConversationArchive {
  const title=messages.find(m=>m.role==='user')?.content.trim().replace(/\s+/g,' ').slice(0,80) || 'Sembang baharu';
  const conversation={id,title,updatedAt:new Date().toISOString(),messages,draft};
  return {version:1,activeId:id,conversations:[conversation,...(archive?.conversations || []).filter(c=>c.id!==id)]};
}
export function loadArchive():ConversationArchive|null {
  try {return parseArchive(localStorage.getItem(CONVERSATIONS_KEY));} catch {return null;}
}
