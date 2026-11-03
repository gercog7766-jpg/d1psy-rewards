import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { checkGiveawayRound } from './engine.js';

const APP_URL=process.env.APP_URL||'';
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'';
const TWITCH_CLIENT_ID=process.env.TWITCH_CLIENT_ID||'';
const TWITCH_CLIENT_SECRET=process.env.TWITCH_CLIENT_SECRET||'';
const TWITCH_REDIRECT_URI=process.env.TWITCH_REDIRECT_URI||`${APP_URL}/auth/twitch/callback`;
const EVENTSUB_SECRET=process.env.TWITCH_EVENTSUB_SECRET||'';
const PRIMARY_BROADCASTER_ID=process.env.TWITCH_PRIMARY_BROADCASTER_ID||'';
let pocBroadcasterId=process.env.TWITCH_POC_BROADCASTER_ID||'';
const POC_LOGIN=(process.env.TWITCH_POC_LOGIN||'amych').toLowerCase();
const POC_ISOLATION=process.env.TWITCH_POC_ISOLATION!=='false';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
export const eventSubRouter=express.Router();
type TwitchChatEvent={broadcaster_user_id:string;broadcaster_user_login?:string;broadcaster_user_name?:string;chatter_user_id:string;chatter_user_login:string;chatter_user_name:string;message_id:string;message?:{text?:string}};
type PocMessage={receivedAt:string;broadcasterUserId:string;broadcasterLogin:string;chatterUserId:string;chatterLogin:string;text:string};
type RouteDiagnostic={receivedAt:string;broadcasterUserId:string;broadcasterLogin:string;route:'poc'|'primary'|'ignored'};
const pocMessages:PocMessage[]=[];
const routeDiagnostics:RouteDiagnostic[]=[];
function safeEqual(a:string,b:string){const aa=Buffer.from(a);const bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
function cookie(req:express.Request,name:string){const raw=String(req.header('cookie')||'');for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return ''}
function clearOauthCookie(res:express.Response){res.cookie('poc_oauth_state','',{httpOnly:true,secure:APP_URL.startsWith('https:'),sameSite:'lax',maxAge:0,path:'/'})}
function rememberRoute(event:TwitchChatEvent,occurredAt:string,route:RouteDiagnostic['route']){routeDiagnostics.unshift({receivedAt:occurredAt,broadcasterUserId:event.broadcaster_user_id,broadcasterLogin:event.broadcaster_user_login||'',route});if(routeDiagnostics.length>100)routeDiagnostics.length=100}
async function setConnection(status:'connected'|'disconnected'|'reconnecting'|'error'){await db.from('rewards_settings').update({twitch_connection_status:status,updated_at:new Date().toISOString()}).eq('id',true)}
async function processPrimaryChat(messageId:string,event:TwitchChatEvent,occurredAt:string){
 const {error:dedupError}=await db.from('rewards_event_dedup').insert({event_id:messageId,event_type:'channel.chat.message'});
 if(dedupError){if(dedupError.code==='23505')return;throw dedupError}
 const {data:round}=await db.from('rewards_rounds').select('id,status').eq('status','active').maybeSingle();
 await db.from('rewards_chat_events').insert({twitch_event_id:messageId,round_id:round?.id||null,twitch_user_id:event.chatter_user_id,occurred_at:occurredAt});
 if(!round)return;
 const {error}=await db.rpc('rewards_record_chat_message',{p_round_id:round.id,p_twitch_user_id:event.chatter_user_id});
 if(error)throw error;
 await checkGiveawayRound();
}
function processPocChat(event:TwitchChatEvent,occurredAt:string){
 pocMessages.unshift({receivedAt:occurredAt,broadcasterUserId:event.broadcaster_user_id,broadcasterLogin:event.broadcaster_user_login||'',chatterUserId:event.chatter_user_id,chatterLogin:event.chatter_user_login,text:event.message?.text||''});
 if(pocMessages.length>50)pocMessages.length=50;
 console.log('[MULTISTREAM_POC]',event.broadcaster_user_login||event.broadcaster_user_id,event.chatter_user_login,event.message?.text||'');
}
async function routeChat(messageId:string,event:TwitchChatEvent,occurredAt:string){
 if(pocBroadcasterId&&event.broadcaster_user_id===pocBroadcasterId){rememberRoute(event,occurredAt,'poc');processPocChat(event,occurredAt);return}
 if(POC_ISOLATION){rememberRoute(event,occurredAt,'ignored');console.warn('[MULTISTREAM_POC] isolation ignored broadcaster',event.broadcaster_user_id);return}
 if(PRIMARY_BROADCASTER_ID&&event.broadcaster_user_id!==PRIMARY_BROADCASTER_ID){rememberRoute(event,occurredAt,'ignored');console.warn('[MULTISTREAM_POC] ignored unknown broadcaster',event.broadcaster_user_id);return}
 rememberRoute(event,occurredAt,'primary');
 await processPrimaryChat(messageId,event,occurredAt);
}

// PoC-only OAuth. These routes are mounted before server-next's production OAuth routes,
// so the test branch never reaches rewards_users/rewards_admins during amych authorization.
eventSubRouter.get('/auth/twitch',(_req,res)=>{
 if(!TWITCH_CLIENT_ID||!TWITCH_CLIENT_SECRET||!APP_URL)return res.status(503).send('Twitch OAuth is not configured');
 const state=crypto.randomBytes(24).toString('hex');
 res.cookie('poc_oauth_state',state,{httpOnly:true,secure:APP_URL.startsWith('https:'),sameSite:'lax',maxAge:600000,path:'/'});
 const q=new URLSearchParams({client_id:TWITCH_CLIENT_ID,redirect_uri:TWITCH_REDIRECT_URI,response_type:'code',scope:'user:read:chat user:bot channel:bot',force_verify:'true',state});
 res.redirect(`https://id.twitch.tv/oauth2/authorize?${q}`);
});
eventSubRouter.get('/auth/twitch/callback',async(req,res)=>{try{
 const expectedState=cookie(req,'poc_oauth_state');
 if(!req.query.code||!expectedState||String(req.query.state||'')!==expectedState)return res.status(400).send('Invalid OAuth state');
 const tokenRes=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:TWITCH_CLIENT_ID,client_secret:TWITCH_CLIENT_SECRET,code:String(req.query.code),grant_type:'authorization_code',redirect_uri:TWITCH_REDIRECT_URI})});
 if(!tokenRes.ok)throw new Error(`OAuth token exchange failed ${tokenRes.status}`);
 const token:any=await tokenRes.json();
 const userRes=await fetch('https://api.twitch.tv/helix/users',{headers:{Authorization:`Bearer ${token.access_token}`,'Client-Id':TWITCH_CLIENT_ID}});
 if(!userRes.ok)throw new Error(`Twitch user lookup failed ${userRes.status}`);
 const user:any=(await userRes.json()).data?.[0];
 if(!user)throw new Error('Twitch user missing');
 if(String(user.login||'').toLowerCase()!==POC_LOGIN){clearOauthCookie(res);return res.status(403).send(`PoC OAuth requires Twitch account ${POC_LOGIN}`)}
 pocBroadcasterId=String(user.id);
 const subscription=await subscribeToPocChat(pocBroadcasterId);
 clearOauthCookie(res);
 console.log('[MULTISTREAM_POC] OAuth complete',user.login,user.id);
 res.type('html').send(`<h1>Multi-stream PoC connected</h1><p>Twitch: <b>${String(user.display_name||user.login)}</b></p><p>Broadcaster ID: <code>${pocBroadcasterId}</code></p><p>EventSub: <code>${subscription.alreadyExists?'already exists':'created'}</code></p><p><a href="/api/poc/multistream">Open PoC messages</a></p>`);
 }catch(e:any){console.error('[MULTISTREAM_POC] OAuth failed',e);clearOauthCookie(res);res.status(500).send(`PoC Twitch authentication failed: ${String(e?.message||e)}`)}});

eventSubRouter.get('/api/poc/multistream',(_req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:!!pocBroadcasterId,isolation:POC_ISOLATION,pocBroadcasterId:pocBroadcasterId||null,pocLogin:POC_LOGIN,count:pocMessages.length,messages:pocMessages.slice(0,20)})});
eventSubRouter.get('/api/poc/routes',(_req,res)=>{res.set('Cache-Control','no-store');res.json({isolation:POC_ISOLATION,primaryWritesEnabled:!POC_ISOLATION,primaryBroadcasterId:PRIMARY_BROADCASTER_ID||null,pocBroadcasterId:pocBroadcasterId||null,routes:routeDiagnostics.slice(0,50)})});
eventSubRouter.post('/eventsub/twitch',express.raw({type:'application/json'}),async(req,res)=>{try{
 if(!EVENTSUB_SECRET)return res.sendStatus(503);
 const id=String(req.header('Twitch-Eventsub-Message-Id')||'');const timestamp=String(req.header('Twitch-Eventsub-Message-Timestamp')||'');const signature=String(req.header('Twitch-Eventsub-Message-Signature')||'');const type=String(req.header('Twitch-Eventsub-Message-Type')||'');
 if(!id||!timestamp||!signature||!Buffer.isBuffer(req.body))return res.sendStatus(400);
 const age=Math.abs(Date.now()-Date.parse(timestamp));if(!Number.isFinite(age)||age>10*60*1000)return res.sendStatus(403);
 const expected='sha256='+crypto.createHmac('sha256',EVENTSUB_SECRET).update(id+timestamp).update(req.body).digest('hex');if(!safeEqual(expected,signature))return res.sendStatus(403);
 const payload=JSON.parse(req.body.toString('utf8'));
 if(type==='webhook_callback_verification'){return res.type('text/plain').status(200).send(String(payload.challenge||''))}
 if(type==='revocation'){const broadcasterId=String(payload.subscription?.condition?.broadcaster_user_id||'');if(!POC_ISOLATION&&(!pocBroadcasterId||broadcasterId!==pocBroadcasterId)){await setConnection('error');await db.from('rewards_audit_log').insert({action:'twitch_eventsub_revoked',entity_type:'eventsub',entity_id:payload.subscription?.id||null,details:{status:payload.subscription?.status||'unknown'}})}return res.sendStatus(204)}
 if(type==='notification'&&payload.subscription?.type==='channel.chat.message'){const event=payload.event as TwitchChatEvent;const isPoc=!!pocBroadcasterId&&event.broadcaster_user_id===pocBroadcasterId;if(!POC_ISOLATION&&!isPoc)await setConnection('connected');res.sendStatus(204);void routeChat(id,event,timestamp).catch(async e=>{console.error('EventSub processing failed',e);if(!POC_ISOLATION&&!isPoc)await setConnection('error')});return}
 return res.sendStatus(204);
 }catch(e){console.error('EventSub webhook failed',e);return res.sendStatus(500)}});
async function getAppToken(){const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:TWITCH_CLIENT_ID,client_secret:TWITCH_CLIENT_SECRET,grant_type:'client_credentials'})});if(!r.ok)throw new Error(`Twitch app token failed: ${r.status}`);return(await r.json()as any).access_token as string}
async function createChatSubscription(broadcasterUserId:string,writeProductionStatus:boolean){
 if(!APP_URL||!TWITCH_CLIENT_ID||!TWITCH_CLIENT_SECRET||!EVENTSUB_SECRET)throw new Error('eventsub_not_configured');
 if(writeProductionStatus&&!POC_ISOLATION)await setConnection('reconnecting');
 const token=await getAppToken();
 const r=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Client-Id':TWITCH_CLIENT_ID,'Content-Type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:broadcasterUserId,user_id:broadcasterUserId},transport:{method:'webhook',callback:`${APP_URL}/eventsub/twitch`,secret:EVENTSUB_SECRET}})});
 const body:any=await r.json().catch(()=>({}));
 if(r.status===409){if(writeProductionStatus&&!POC_ISOLATION)await setConnection('connected');return {data:[],alreadyExists:true,conflict:body}}
 if(!r.ok){if(writeProductionStatus&&!POC_ISOLATION)await setConnection('error');throw new Error(`Twitch EventSub subscribe failed ${r.status}: ${JSON.stringify(body)}`)}
 return body;
}
async function subscribeToPocChat(broadcasterUserId:string){return createChatSubscription(broadcasterUserId,false)}
export async function subscribeToChat(broadcasterUserId:string){return createChatSubscription(broadcasterUserId,true)}
