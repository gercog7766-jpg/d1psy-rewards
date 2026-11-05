// Opt-in, isolated Twitch OAuth + EventSub subscription. No database writes or token persistence.
import {createOAuthState,validateOAuthState,oauthStateCookie,clearOAuthStateCookie} from './twitch-oauth-state.mjs';
import {validateIsolatedTwitchIdentity} from './twitch-oauth-identity.mjs';
import {timingSafeEqual,randomBytes,createHash} from 'node:crypto';

const BROADCASTER='39780903';
const REDIRECT='https://d1psy-multistream-isolated-api.onrender.com/oauth/twitch/callback';
const COOKIE='__Host-isolated-oauth-state';
const pending=new Map();
const invites=new Map();
const INVITE_TTL_MS=15*60*1000;
const inviteDigest=token=>createHash('sha256').update(token).digest('hex');
function cleanup(){const now=Date.now();for(const [k,v] of pending)if(v.expiresAt<=now)pending.delete(k);for(const [k,v] of invites)if(v<=now)invites.delete(k)}
function twitchAuthorizeUrl(env,state){const params=new URLSearchParams({response_type:'code',client_id:env.TWITCH_OAUTH_CLIENT_ID,redirect_uri:REDIRECT,scope:'user:read:chat user:bot channel:bot',state:state.value,force_verify:'true'});return 'https://id.twitch.tv/oauth2/authorize?'+params.toString()}
export function handleOAuthInvite(req,res,env=process.env){
 const path=new URL(req.url||'/', 'http://localhost').pathname;
 if(path==='/api/test/twitch/invite'&&req.method==='POST'){
  if(!config(env))return json(res,503,{error:'isolated_oauth_disabled'}),true;
  if(!bearerOk(req,env))return json(res,401,{error:'unauthorized'}),true;
  cleanup();if(invites.size>=100)return json(res,429,{error:'too_many_pending_invites'}),true;
  const token=randomBytes(32).toString('base64url');invites.set(inviteDigest(token),Date.now()+INVITE_TTL_MS);
  json(res,200,{invite_url:'https://d1psy-multistream-isolated-api.onrender.com/oauth/twitch/invite/'+token,expires_in_seconds:900});return true;
 }
 if((req.method==='GET'||req.method==='POST')&&path.startsWith('/oauth/twitch/invite/')){
  if(!config(env))return json(res,503,{error:'isolated_oauth_disabled'}),true;
  const token=path.slice('/oauth/twitch/invite/'.length);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return json(res,403,{error:'invalid_or_expired_invite'}),true;
  cleanup();const digest=inviteDigest(token),expiresAt=invites.get(digest);
  if(!expiresAt||expiresAt<=Date.now())return json(res,403,{error:'invalid_or_expired_invite'}),true;
  if(req.method==='GET'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://id.twitch.tv; base-uri 'none'; frame-ancestors 'none'"});
   res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Подключение Twitch · amych</title><body style="font:16px system-ui;background:#101728;color:#fff;max-width:540px;margin:8vh auto;padding:24px"><h1>Подключить Twitch · amych</h1><p>Войдите в Twitch под аккаунтом <strong>amych</strong>. Это изолированная проверка EventSub без розыгрышей и выдачи призов.</p><form method="post"><button style="background:#9146ff;color:white;padding:14px 22px;border:0;border-radius:8px;cursor:pointer;font-size:16px">Продолжить через Twitch</button></form><p>Ссылка одноразовая и действует 15 минут. Простое открытие страницы не расходует приглашение.</p></body></html>');return true;
  }
  invites.delete(digest);
  const state=createOAuthState();pending.set(state.value,state);
  const destination=twitchAuthorizeUrl(env,state);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','set-cookie':oauthStateCookie(state.value),'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twitch · amych</title><body style="font:16px system-ui;background:#101728;color:#fff;max-width:540px;margin:8vh auto;padding:24px"><h1>Переход на Twitch</h1><p>Приглашение принято. Нажмите кнопку ниже, чтобы открыть официальный сайт Twitch и разрешить доступ для аккаунта <strong>amych</strong>.</p><a rel="noreferrer" href="'+destination.replaceAll('&','&amp;')+'" style="display:inline-block;background:#9146ff;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Открыть Twitch</a><p>Если переход не происходит автоматически, используйте эту ссылку. Не пересылайте адрес страницы авторизации.</p></body></html>');return true;
 }
 return false;
}

export const readiness={subscription_created_by_app:false,status:'not_configured',last_checked_at:null,subscription_id:null};
export async function currentTwitchSubscription(env=process.env){
 if(!config(env))return {status:'not_configured',checked:false};
 try{
  const app=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,grant_type:'client_credentials'})});
  if(typeof app.access_token!=='string')throw new Error('app_token_invalid');
  const query=readiness.subscription_id?'?id='+encodeURIComponent(readiness.subscription_id):'?type=channel.chat.message';
  const result=await twitch('https://api.twitch.tv/helix/eventsub/subscriptions'+query,{headers:{authorization:'Bearer '+app.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID}});
  const entries=Array.isArray(result.data)?result.data:[];
  const match=entries.find(x=>x.type==='channel.chat.message'&&x.condition?.broadcaster_user_id===BROADCASTER&&x.transport?.method==='webhook'&&x.transport?.callback==='https://d1psy-multistream-isolated-api.onrender.com/eventsub/twitch');
  return {status:match?.status||'not_found',checked:true,checked_at:new Date().toISOString()};
 }catch{return {status:'check_failed',checked:false,checked_at:new Date().toISOString()};}
}
const json=(res,status,value,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',...headers});res.end(JSON.stringify(value));};
function config(env){
 return (()=>{try{return new URL(env.DATABASE_URL||'').pathname==='/d1psy_multistream_test_db'}catch{return false}})()&&env.ISOLATED_TEST_API==='true'&&env.TWITCH_OAUTH_ENABLED==='true'&&env.TWITCH_PROBE_ENABLED==='true'&&env.TWITCH_PROBE_BROADCASTER_ID===BROADCASTER&&
 /^[a-z0-9]{20,64}$/.test(env.TWITCH_OAUTH_CLIENT_ID||'')&&
 typeof env.TWITCH_OAUTH_CLIENT_SECRET==='string'&&env.TWITCH_OAUTH_CLIENT_SECRET.length>=24&&
 typeof env.TWITCH_PROBE_SECRET==='string'&&env.TWITCH_PROBE_SECRET.length>=32&&
 env.ENABLE_GIVEAWAYS!=='true'&&env.MULTISTREAM_DB_ENABLED!=='true'&&env.ATOMIC_CHAT_RPC_ENABLED!=='true'&&
 !env.SUPABASE_URL&&!env.SUPABASE_SECRET_KEY&&!env.TWITCH_CLIENT_SECRET&&!env.TWITCH_CLIENT_ID;
}
export function oauthReady(env=process.env){return config(env)}
function bearerOk(req,env){
 const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
 const a=Buffer.from(supplied),b=Buffer.from(env.TEST_API_TOKEN||'');
 return b.length>=32&&a.length===b.length&&timingSafeEqual(a,b);
}
async function twitch(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000),headers:{accept:'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error('twitch_http_'+response.status);
 return data;
}
export function handleOAuthStart(req,res,env=process.env){
 if(req.method!=='POST'||new URL(req.url||'/', 'http://localhost').pathname!=='/api/test/twitch/authorize')return false;
 if(!config(env))return json(res,503,{error:'isolated_oauth_disabled'}),true;
 if(!bearerOk(req,env))return json(res,401,{error:'unauthorized'}),true;
 const state=createOAuthState();
 cleanup();
 pending.set(state.value,state);
 json(res,200,{authorization_url:twitchAuthorizeUrl(env,state)},{'set-cookie':oauthStateCookie(state.value)});
 return true;
}
export async function handleIsolatedOAuthCallback(req,res,env=process.env){
 if(req.method!=='GET'||new URL(req.url||'/', 'http://localhost').pathname!=='/oauth/twitch/callback')return false;
 const headers={'set-cookie':clearOAuthStateCookie()};
 const fail=(status,error)=>json(res,status,{error},headers);
 if(!config(env)){fail(503,'isolated_oauth_disabled');return true}
 const url=new URL(req.url,'http://localhost');
 const state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const record=pending.get(state);
 if(state)pending.delete(state); // one use even on failure
 if(!record||!validateOAuthState({expected:cookie,received:state,createdAt:record.createdAt})||typeof code!=='string'||code.length<5||code.length>2048){fail(403,'invalid_oauth_state');return true}
 try{
  const token=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,code,grant_type:'authorization_code',redirect_uri:REDIRECT})});
  const access=token.access_token;
  if(typeof access!=='string'){fail(502,'twitch_token_invalid');return true}
  const info=await twitch('https://id.twitch.tv/oauth2/validate',{headers:{authorization:'OAuth '+access}});
  const users=await twitch('https://api.twitch.tv/helix/users',{headers:{authorization:'Bearer '+access,'client-id':env.TWITCH_OAUTH_CLIENT_ID}});
  const identity=validateIsolatedTwitchIdentity({tokenInfo:info,userInfo:users.data?.[0],expectedClientId:env.TWITCH_OAUTH_CLIENT_ID});
  if(!identity.ok){fail(403,identity.reason);return true}
  const app=await twitch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.TWITCH_OAUTH_CLIENT_ID,client_secret:env.TWITCH_OAUTH_CLIENT_SECRET,grant_type:'client_credentials'})});
  if(typeof app.access_token!=='string'){fail(502,'app_token_invalid');return true}
  const sub=await twitch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{authorization:'Bearer '+app.access_token,'client-id':env.TWITCH_OAUTH_CLIENT_ID,'content-type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:BROADCASTER,user_id:BROADCASTER},transport:{method:'webhook',callback:'https://d1psy-multistream-isolated-api.onrender.com/eventsub/twitch',secret:env.TWITCH_PROBE_SECRET}})});
  readiness.subscription_created_by_app=Array.isArray(sub.data)&&sub.data.length>0;
  readiness.subscription_id=sub.data?.[0]?.id||null;
  readiness.status=sub.data?.[0]?.status||'unknown';
  readiness.last_checked_at=new Date().toISOString();
  json(res,200,{ok:readiness.subscription_created_by_app,subscription_status:readiness.status,broadcaster:'amych',isolated:true,giveaway_processing:false},headers);
 }catch{
  readiness.status='oauth_or_subscription_failed';
  readiness.last_checked_at=new Date().toISOString();
  fail(502,'twitch_oauth_or_subscription_failed');
 }
 return true;
}
