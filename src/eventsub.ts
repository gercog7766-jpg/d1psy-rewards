import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { checkGiveawayRound } from './engine.js';

const APP_URL=process.env.APP_URL||'';
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'';
const TWITCH_CLIENT_ID=process.env.TWITCH_CLIENT_ID||'';
const TWITCH_CLIENT_SECRET=process.env.TWITCH_CLIENT_SECRET||'';
const EVENTSUB_SECRET=process.env.TWITCH_EVENTSUB_SECRET||'';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
export const eventSubRouter=express.Router();
type TwitchChatEvent={broadcaster_user_id:string;chatter_user_id:string;chatter_user_login:string;chatter_user_name:string;message_id:string};
function safeEqual(a:string,b:string){const aa=Buffer.from(a);const bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
async function setConnection(status:'connected'|'disconnected'|'reconnecting'|'error'){await db.from('rewards_settings').update({twitch_connection_status:status,updated_at:new Date().toISOString()}).eq('id',true)}
async function processChat(messageId:string,event:TwitchChatEvent,occurredAt:string){
 const {error:dedupError}=await db.from('rewards_event_dedup').insert({event_id:messageId,event_type:'channel.chat.message'});
 if(dedupError){if(dedupError.code==='23505')return;throw dedupError}
 const {data:round}=await db.from('rewards_rounds').select('id,status').eq('status','active').maybeSingle();
 await db.from('rewards_chat_events').insert({twitch_event_id:messageId,round_id:round?.id||null,twitch_user_id:event.chatter_user_id,occurred_at:occurredAt});
 if(!round)return;
 const {error}=await db.rpc('rewards_record_chat_message',{p_round_id:round.id,p_twitch_user_id:event.chatter_user_id});
 if(error)throw error;
 await checkGiveawayRound();
}
eventSubRouter.post('/eventsub/twitch',express.raw({type:'application/json'}),async(req,res)=>{try{
 if(!EVENTSUB_SECRET)return res.sendStatus(503);
 const id=String(req.header('Twitch-Eventsub-Message-Id')||'');const timestamp=String(req.header('Twitch-Eventsub-Message-Timestamp')||'');const signature=String(req.header('Twitch-Eventsub-Message-Signature')||'');const type=String(req.header('Twitch-Eventsub-Message-Type')||'');
 if(!id||!timestamp||!signature||!Buffer.isBuffer(req.body))return res.sendStatus(400);
 const age=Math.abs(Date.now()-Date.parse(timestamp));if(!Number.isFinite(age)||age>10*60*1000)return res.sendStatus(403);
 const expected='sha256='+crypto.createHmac('sha256',EVENTSUB_SECRET).update(id+timestamp).update(req.body).digest('hex');if(!safeEqual(expected,signature))return res.sendStatus(403);
 const payload=JSON.parse(req.body.toString('utf8'));
 if(type==='webhook_callback_verification'){await setConnection('connected');return res.type('text/plain').status(200).send(String(payload.challenge||''))}
 if(type==='revocation'){await setConnection('error');await db.from('rewards_audit_log').insert({action:'twitch_eventsub_revoked',entity_type:'eventsub',entity_id:payload.subscription?.id||null,details:{status:payload.subscription?.status||'unknown'}});return res.sendStatus(204)}
 if(type==='notification'&&payload.subscription?.type==='channel.chat.message'){await setConnection('connected');res.sendStatus(204);void processChat(id,payload.event as TwitchChatEvent,timestamp).catch(async e=>{console.error('EventSub processing failed',e);await setConnection('error')});return}
 return res.sendStatus(204);
 }catch(e){console.error('EventSub webhook failed',e);return res.sendStatus(500)}});
async function getAppToken(){const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:TWITCH_CLIENT_ID,client_secret:TWITCH_CLIENT_SECRET,grant_type:'client_credentials'})});if(!r.ok)throw new Error(`Twitch app token failed: ${r.status}`);return(await r.json()as any).access_token as string}
export async function subscribeToChat(broadcasterUserId:string){if(!APP_URL||!TWITCH_CLIENT_ID||!TWITCH_CLIENT_SECRET||!EVENTSUB_SECRET)throw new Error('eventsub_not_configured');await setConnection('reconnecting');const token=await getAppToken();const r=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Client-Id':TWITCH_CLIENT_ID,'Content-Type':'application/json'},body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:broadcasterUserId,user_id:broadcasterUserId},transport:{method:'webhook',callback:`${APP_URL}/eventsub/twitch`,secret:EVENTSUB_SECRET}})});const body:any=await r.json().catch(()=>({}));if(r.status===409){await setConnection('connected');return {data:[],alreadyExists:true,conflict:body}}if(!r.ok){await setConnection('error');throw new Error(`Twitch EventSub subscribe failed ${r.status}: ${JSON.stringify(body)}`)}return body}
