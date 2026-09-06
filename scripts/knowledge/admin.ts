import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
export function checkSecret(input: unknown, secret: string) {
  if(!secret || typeof input !== 'string') return false;
  const digest=(value:string)=>createHmac('sha256',secret).update(value).digest();
  return timingSafeEqual(digest(input),digest(secret));
}
export function adminCookie(secret:string,now=Date.now()) {
  const payload=Buffer.from(JSON.stringify({expires:now+8*60*60*1000,nonce:randomUUID()})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function isAdmin(cookie:string|undefined,secret:string,now=Date.now()) {
  if(!secret) return false;
  const value=(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mursyid_admin='))?.slice('mursyid_admin='.length);
  if(!value) return false;
  const [payload,signature]=value.split('.');
  if(!payload || !signature) return false;
  const expected=createHmac('sha256',secret).update(payload).digest('base64url');
  if(signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return false;
  try {return Number(JSON.parse(Buffer.from(payload,'base64url').toString()).expires)>now;}catch{return false;}
}
