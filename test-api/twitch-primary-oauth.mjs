// Second broadcaster OAuth: isolated-only, opt-in, one-time invitation, no token persistence.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createOAuthState,validateOAuthState} from './twitch-oauth-state.mjs';
import {validatePrimaryTwitchIdentity} from './twitch-primary-identity.mjs';
import {probeConfig} from './twitch-probe.mjs';
const BASE='https://d1psy-multistream-isolated-api.onrender.com';
const CALLBACK=BASE+'/oauth/twitch/callback';
const COOKIE='__Host-isolated-primary-state';
const invitations=new Map(),pending=new Map();
const TTL=15*60*1000;
export const primaryState={broadcaster_id:null,subscription_id:null,subscription_status:'not_configured',last_checked_at:null};
const reply=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',...headers});res.end(JSON.stringify(data));};
const ready=env=>probeConfig(env)&&env.TWITCH_OAUTH_ENABLED==='true'&&/^[a-z0-9]{20,64}$/.test(env.TWITCH_OAUTH_CLIENT_ID||'')&&typeof env.TWITCH_OAUTH_CLIENT_SECRET==='string'&&env.TWITCH_OAUTH_CLIENT_SECRET.length>=24;
const authorized=(req,env)=>{const a=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'')),b=Buffer.from(env.TEST_API_TOKEN||'');return b.length>=32&&a.length===b.length&&timingSafeEqual(a,b)};
const digest=v=>createHash('sha256').update(v).digest('hex');
function clean(){const now=Date.now();for(const [k,v] of invitations)if(v<=now)invitations.delete(k);for(const [k,v] of pending)if(v.expiresAt<=now)pending.delete(k);}
const cookie=v=>COOKIE+'='+v+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300';
const clearCookie=()=>COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
async function twitch(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000),headers:{accept:'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error('twitch_http_'+response.status);
 return data;
}
export function handlePrimaryInvite(req,res,env=process.env){
 const path=new URL(req.url||'/', 'http://localhost').pathname;
 if(path==='/api/test/twitch/primary/invite'&&req.method==='POST'){
  if(!ready(env))return reply(res,503,{error:'isolated_primary_disabled'}),true;
  if(!authorized(req,env))return reply(res,401,{error:'unauthorized'}),true;
  clean();if(invitations.size>=100)return reply(res,429,{error:'too_many_invites'}),true;
  const value=randomBytes(32).toString('base64url');invitations.set(digest(value),Date.now()+TTL);
  reply(res,200,{invite_url:BASE+'/oauth/twitch/primary/invite/'+value,expires_in_seconds:900});return true;
 }
 if(!path.startsWith('/oauth/twitch/primary/invite/')||!['GET','POST'].includes(req.method))return false;
 if(!ready(env))return reply(res,503,{error:'isolated_primary_disabled'}),true;
 const value=path.slice('/oauth/twitch/primary/invite/'.length);
 if(!/^[A-Za-z0-9_-]{43}$/.test(value))return reply(res,403,{error:'invalid_or_expired_invite'}),true;
 clean();const key=digest(value),expires=invitations.get(key);
 if(!expires||expires<=Date.now())return reply(res,403,{error:'invalid_or_expired_invite'}),true;
 if(req.method==='GET'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
  res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Подключить Twitch · d1psy_off</title><body style="font:16px system-ui;background:#101728;color:white;max-width:550px;margin:8vh auto;padding:24px"><h1>Подключить Twitch · d1psy_off</h1><p>Войдите именно в аккаунт d1psy_off. Только изолированное чтение чата, без призов.</p><form method="post"><button style="background:#9146ff;color:white;padding:14px;border:0;border-radius:8px">Продолжить через Twitch</button></form></body></html>');return true;
 }
 invitations.delete(key);const state=createOAuthState();pending.set(state.value,state);
 const params=new URLSearchParams({response_type:'code',client_id:env.TWITCH_OAUTH_CLIENT_ID,redirect_uri:CALLBACK,scope:'user:read:chat user:bot channel:bot',state:state.value,force_verify:'true'});
 const destination='https://id.twitch.tv/oauth2/authorize?'+params.toString();
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','set-cookie':cookie(state.value),'cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
 res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Twitch · d1psy_off</title><body style="font:16px system-ui;background:#101728;color:white;max-width:550px;margin:8vh auto;padding:24px"><h1>Переход на Twitch</h1><p>Нажмите, чтобы авторизовать d1psy_off.</p><a rel="noreferrer" style="display:inline-block;background:#9146ff;color:white;padding:14px;border-radius:8px" href="'+destination.replaceAll('&','&amp;')+'">Открыть Twitch</a></body></html>');return true;
}
export async function handlePrimaryCallback(req,res,env=process.env){
 if(req.method!=='GET'||new URL(req.url||'/', 'http://localhost').pathname!=='/oauth/twitch/callback')return false;
 const url=new URL(req.url,'http://localhost'),state=url.searchParams.get('state');
 if(!state||!pending.has(state))return false;
 const record=pending.get(state);pending.delete(state);
 const fail=(status,error)=>reply(res,status,{error},{'set-cookie':clearCookie()});
 const cookieValue=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const code=url.searchParams.get('code');
 if(!ready(env)||!validateOAuthState({expected:cookieValue,received:state,createdAt:record.createdAt})||typeof code!=='string'||code.length<5||code.length>2048){fail(403,'invalid_primary_oauth_state');return true;}
 try{
  const token=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,code,grant_type:'authorization_code',redirect_uri:CALLBACK})});
  if(typeof token.access_token!=='string')throw Error('token_missing');
  const headers={authorization:'Bearer '+token.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID};
  const identity=validatePrimaryTwitchIdentity({
   tokenInfo:await twitch('https://id.twitch.tv/oauth2/validate',{headers:{authorization:'OAuth '+token.access_token}}),
   userInfo:(await twitch('https://api.twitch.tv/helix/users',{headers})).data?.[0],
   expectedClientId:env.TWITCH_OAUTH_CLIENT_ID
  });
  if(!identity.ok){fail(403,identity.reason);return true;}
  const app=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,grant_type:'client_credentials'})});
  if(typeof app.access_token!=='string')throw Error('app_token_missing');
  const sub=await twitch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{authorization:'Bearer '+app.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID,'content-type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:identity.broadcaster_id,user_id:identity.broadcaster_id},transport:{method:'webhook',callback:BASE+'/eventsub/twitch',secret:env.TWITCH_PROBE_SECRET}})});
  if(!sub.data?.[0]?.id)throw Error('subscription_missing');
  primaryState.broadcaster_id=identity.broadcaster_id;primaryState.subscription_id=sub.data[0].id;primaryState.subscription_status=sub.data[0].status||'unknown';primaryState.last_checked_at=new Date().toISOString();
  reply(res,200,{ok:true,broadcaster:'d1psy_off',subscription_status:primaryState.subscription_status,isolated:true,giveaway_processing:false},{'set-cookie':clearCookie()});
 }catch{fail(502,'primary_oauth_or_subscription_failed');}
 return true;
}
export async function currentPrimarySubscription(env=process.env){
 if(!ready(env))return {status:'not_configured',checked:false};
 try{
  const app=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,grant_type:'client_credentials'})});
  const result=await twitch('https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message',{headers:{authorization:'Bearer '+app.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID}});
  const match=result.data?.find(s=>s.type==='channel.chat.message'&&s.transport?.method==='webhook'&&s.transport?.callback===BASE+'/eventsub/twitch'&&s.condition?.broadcaster_user_id===primaryState.broadcaster_id);
  return {status:match?.status||'not_found',checked:true};
 }catch{return {status:'check_failed',checked:false};}
}

export async function restorePrimarySubscription(env=process.env){
 if(!ready(env)||primaryState.broadcaster_id)return false;
 try{
  const app=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,grant_type:'client_credentials'})});
  const headers={authorization:'Bearer '+app.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID};
  const users=await twitch('https://api.twitch.tv/helix/users?login=d1psy_off',{headers});
  const id=users.data?.find(u=>u.login?.toLowerCase()==='d1psy_off')?.id;
  if(!id||id==='39780903')return false;
  const subs=await twitch('https://api.twitch.tv/helix/eventsub/subscriptions?type=channel.chat.message',{headers});
  const sub=subs.data?.find(x=>x.type==='channel.chat.message'&&x.status==='enabled'&&x.condition?.broadcaster_user_id===id&&x.condition?.user_id===id&&x.transport?.method==='webhook'&&x.transport?.callback===BASE+'/eventsub/twitch');
  if(!sub)return false;
  primaryState.broadcaster_id=id;primaryState.subscription_id=sub.id;primaryState.subscription_status=sub.status;primaryState.last_checked_at=new Date().toISOString();
  return true;
 }catch{return false;}
}
