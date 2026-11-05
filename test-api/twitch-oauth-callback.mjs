// Opt-in, isolated Twitch OAuth + EventSub subscription. No database writes or token persistence.
import {createOAuthState,validateOAuthState,oauthStateCookie,clearOAuthStateCookie} from './twitch-oauth-state.mjs';
import {validateIsolatedTwitchIdentity} from './twitch-oauth-identity.mjs';
import {timingSafeEqual} from 'node:crypto';

const BROADCASTER='39780903';
const REDIRECT='https://d1psy-multistream-isolated-api.onrender.com/oauth/twitch/callback';
const COOKIE='__Host-isolated-oauth-state';
const pending=new Map();
export const readiness={subscription_created_by_app:false,status:'not_configured',last_checked_at:null};
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
 for(const [key,value] of pending)if(value.expiresAt<Date.now())pending.delete(key);
 pending.set(state.value,state);
 const params=new URLSearchParams({response_type:'code',client_id:env.TWITCH_OAUTH_CLIENT_ID,redirect_uri:REDIRECT,scope:'user:read:chat',state:state.value,force_verify:'true'});
 json(res,200,{authorization_url:'https://id.twitch.tv/oauth2/authorize?'+params.toString()},{'set-cookie':oauthStateCookie(state.value)});
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
