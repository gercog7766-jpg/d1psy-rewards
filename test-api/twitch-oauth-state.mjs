// Pure OAuth state primitives. Not wired to a live authorization flow.
// State is random, one-time, short-lived, and bound to an HttpOnly cookie.
import {randomBytes,timingSafeEqual} from 'node:crypto';
export const STATE_TTL_MS=5*60*1000;
export function createOAuthState(now=Date.now()){
 const value=randomBytes(32).toString('base64url');
 return {value,createdAt:now,expiresAt:now+STATE_TTL_MS};
}
export function validateOAuthState({expected,received,createdAt,now=Date.now()}){
 if(typeof expected!=='string'||typeof received!=='string'||typeof createdAt!=='number')return false;
 if(!Number.isFinite(createdAt)||createdAt>now||now-createdAt>STATE_TTL_MS)return false;
 if(!/^[A-Za-z0-9_-]{43}$/.test(expected)||!/^[A-Za-z0-9_-]{43}$/.test(received))return false;
 const a=Buffer.from(expected),b=Buffer.from(received);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function oauthStateCookie(value){
 if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error('invalid OAuth state');
 return '__Host-isolated-oauth-state='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300';
}
export function clearOAuthStateCookie(){
 return '__Host-isolated-oauth-state=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
}
