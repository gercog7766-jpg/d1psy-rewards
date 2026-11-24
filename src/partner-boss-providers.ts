import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { io } from 'socket.io-client';
import { donationAlertEvent, inspectBossTwitchSubscriptions, twitchBossEvent } from './live-boss-events.js';
import { normalizeIhaqEvent } from './live-boss-ihaq.js';

async function approved(db:SupabaseClient,id:string) {
 const {data,error}=await db.from('rewards_streamer_live_profiles').select('broadcaster_id').eq('broadcaster_id',id).eq('status','approved').maybeSingle();
 if(error)throw Error('partner_lookup_failed');return Boolean(data);
}
async function apply(db:SupabaseClient,channel:string,event:any) {
 const {p_confirmed:_,...args}=event;
 const {error}=await db.rpc('rewards_partner_boss_provider_hit',{p_channel:channel,...args});
 if(error)throw Error('partner_boss_event_failed');
}

export function installPartnerBossWebhook(app:Express,db:SupabaseClient,secret:string){
 app.post('/eventsub/partner-boss',express.raw({type:'application/json',limit:'64kb'}),async(q,r)=>{
  if(!secret)return void r.sendStatus(503);
  const eventId=q.get('Twitch-Eventsub-Message-Id')||'',at=q.get('Twitch-Eventsub-Message-Timestamp')||'',sig=q.get('Twitch-Eventsub-Message-Signature')||'',kind=q.get('Twitch-Eventsub-Message-Type')||'';
  if(!eventId||eventId.length>200||!Buffer.isBuffer(q.body)||!Number.isFinite(Date.parse(at))||Math.abs(Date.now()-Date.parse(at))>600000)return void r.sendStatus(400);
  const expected='sha256='+createHmac('sha256',secret).update(eventId+at).update(q.body).digest('hex');
  if(!/^sha256=[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return void r.sendStatus(403);
  try{const p=JSON.parse(q.body.toString('utf8')),type=p.subscription?.type,id=p.subscription?.condition?.broadcaster_user_id;
   if(!['channel.subscribe','channel.subscription.gift'].includes(type)||!/^\d{1,30}$/.test(id||'')||!await approved(db,id))return void r.sendStatus(403);
   if(kind==='webhook_callback_verification'&&typeof p.challenge==='string')return void r.type('text/plain').send(p.challenge);
   if(kind==='notification'&&p.event?.broadcaster_user_id===id){const hit=twitchBossEvent(type,p.event,eventId,at);if(hit)await apply(db,id,hit)}r.sendStatus(204);
  }catch{r.sendStatus(503)}
 });
}

type Options={origin:string;twitchRedirect:string;twitchClient:string;twitchSecret:string;eventSecret:string;daClient:string;daSecret:string;encryptionKey:string};
type Tokens={access:string;refresh:string;expires:number};
export function installPartnerBossProviders(app:Express,db:SupabaseClient,user:RequestHandler,o:Options){
 const pending=new Map<string,{actor:string;expires:number}>(),key=createHash('sha256').update(o.encryptionKey||'disabled').digest();
 const daRedirect=o.origin+'/auth/boss/donationalerts',callback=o.origin+'/eventsub/partner-boss';
 const twitchReady=Boolean(o.twitchClient&&o.twitchSecret&&o.eventSecret),daReady=Boolean(o.daClient&&o.daSecret&&o.encryptionKey);
 const status=new Map<string,string>();
 const sockets=new Map<string,{token:string;socket:ReturnType<typeof io>}>();
 const seal=(value:unknown)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64')};
 const unseal=(value:string)=>{const raw=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));cipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8'))};
 const partner:RequestHandler=async(_q,r,n)=>{try{if(!await approved(db,r.locals.session.twitchUserId))return void r.sendStatus(403);r.set('Cache-Control','no-store');n()}catch{r.sendStatus(503)}};
 const save=async(actor:string,provider:string,value:unknown)=>{const {error}=await db.from('rewards_partner_boss_credentials').upsert({broadcaster_id:actor,provider,ciphertext:seal(value),fingerprint:provider==='ihaq'?createHmac('sha256',key).update(String(value).toLowerCase()).digest('hex'):null},{onConflict:'broadcaster_id,provider'});if(error)throw Error('credential_store_failed')};
 const requestToken=async(url:string,args:Record<string,string>)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(args),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('token_failed');return r.json() as Promise<any>};
 const twitchToken=(args:Record<string,string>)=>requestToken('https://id.twitch.tv/oauth2/token',{client_id:o.twitchClient,client_secret:o.twitchSecret,...args});
 const daToken=(args:Record<string,string>)=>requestToken('https://www.donationalerts.com/oauth/token',{client_id:o.daClient,client_secret:o.daSecret,scope:'oauth-donation-index',...args});
 const tokens=(value:any,old=''):Tokens=>{if(typeof value.access_token!=='string'||!value.access_token||!Number.isFinite(Number(value.expires_in))||Number(value.expires_in)<=0||!(value.refresh_token||old))throw Error('token_invalid');return {access:value.access_token,refresh:value.refresh_token||old,expires:Date.now()+Number(value.expires_in)*1000}};
 function begin(actor:string,provider:string,r:any,path:string){for(const [k,v]of pending)if(v.expires<Date.now())pending.delete(k);if(pending.size>=200)throw Error('oauth_busy');const state='partner-'+provider+'-'+randomBytes(24).toString('hex');pending.set(state,{actor,expires:Date.now()+600000});r.cookie('partner_boss_oauth',state,{httpOnly:true,secure:o.origin.startsWith('https:'),sameSite:'lax',path,maxAge:600000});return state}
 app.get('/streamer/live/connect/twitch',user,partner,(_q,r)=>{if(!twitchReady)return void r.sendStatus(503);const state=begin(r.locals.session.twitchUserId,'twitch',r,'/auth/twitch/callback');r.redirect('https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({client_id:o.twitchClient,redirect_uri:o.twitchRedirect,response_type:'code',scope:'user:read:chat user:bot channel:bot moderator:read:chatters channel:read:subscriptions',force_verify:'true',state}))});
 app.get('/streamer/live/connect/donationalerts',user,partner,(_q,r)=>{if(!daReady)return void r.sendStatus(503);const state=begin(r.locals.session.twitchUserId,'da',r,'/auth/boss/donationalerts');r.redirect('https://www.donationalerts.com/oauth/authorize?'+new URLSearchParams({client_id:o.daClient,redirect_uri:daRedirect,response_type:'code',scope:'oauth-donation-index',state}))});
 app.use((q,r,n)=>{const state=typeof q.query.state==='string'?q.query.state:'',twitch=q.path==='/auth/twitch/callback'&&state.startsWith('partner-twitch-'),da=q.path==='/auth/boss/donationalerts'&&state.startsWith('partner-da-');if(q.method!=='GET'||!twitch&&!da)return n();user(q,r,()=>partner(q,r,async()=>{
  const entry=pending.get(state);pending.delete(state);r.clearCookie('partner_boss_oauth',{path:q.path});
  if(!entry||entry.actor!==r.locals.session.twitchUserId||entry.expires<Date.now()||q.cookies?.partner_boss_oauth!==state||typeof q.query.code!=='string')return void r.sendStatus(400);
  try{if(twitch){const u=await twitchToken({grant_type:'authorization_code',code:q.query.code,redirect_uri:o.twitchRedirect});if(!u.scope?.includes('channel:read:subscriptions'))throw Error();const identity=await fetch('https://api.twitch.tv/helix/users',{headers:{'Client-Id':o.twitchClient,Authorization:'Bearer '+u.access_token},signal:AbortSignal.timeout(10000)});if(!identity.ok||(await identity.json() as any).data?.[0]?.id!==entry.actor)return void r.sendStatus(403);const t=await twitchToken({grant_type:'client_credentials'}),headers={'Client-Id':o.twitchClient,Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'};
   for(const type of ['channel.subscribe','channel.subscription.gift']){const resp=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers,body:JSON.stringify({type,version:'1',condition:{broadcaster_user_id:entry.actor},transport:{method:'webhook',callback,secret:o.eventSecret}}),signal:AbortSignal.timeout(10000)});if(!resp.ok&&resp.status!==409)throw Error()}
   const verified=await inspectBossTwitchSubscriptions(entry.actor,callback,headers);if(!['connected','pending'].includes(verified.status))throw Error();status.set(entry.actor+':twitch',verified.status);
  }else await save(entry.actor,'donationalerts',tokens(await daToken({grant_type:'authorization_code',code:q.query.code,redirect_uri:daRedirect})));r.redirect('/streamer/live');}catch{r.status(503).send('Не удалось подключить сервис. Повтори авторизацию.');}
 }));});
 app.post('/api/partner-live/ihaq',user,partner,async(q,r)=>{if(!o.encryptionKey)return void r.sendStatus(503);if(q.get('sec-fetch-site')==='cross-site'||(q.get('origin')&&q.get('origin')!==o.origin)||!q.is('application/json'))return void r.sendStatus(403);const token=q.body?.token;if(typeof token!=='string'||!(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)))return void r.sendStatus(400);if(token.toLowerCase()===(process.env.BOSS_IHAQ_API_TOKEN||'').toLowerCase())return void r.status(409).json({error:'Токен этого сервиса уже подключён'});try{await save(r.locals.session.twitchUserId,'ihaq',token);r.json({ok:true})}catch{r.sendStatus(503)}});
 app.get('/api/partner-live/providers',user,partner,async(_q,r)=>{const actor=r.locals.session.twitchUserId;const {data,error}=await db.from('rewards_partner_boss_credentials').select('provider').eq('broadcaster_id',actor);if(error)return void r.sendStatus(503);let twitch='not_connected';if(twitchReady)try{const token=await twitchToken({grant_type:'client_credentials'});twitch=(await inspectBossTwitchSubscriptions(actor,callback,{'Client-Id':o.twitchClient,Authorization:'Bearer '+token.access_token})).status}catch{twitch='disconnected'}r.json({twitch,donationalerts:data?.some(x=>x.provider==='donationalerts')?status.get(actor+':donationalerts')||'checking':'not_connected',ihaq:data?.some(x=>x.provider==='ihaq')?status.get(actor+':ihaq')||'checking':'not_connected'})});
 if(!o.encryptionKey)return;
 let busy=false;const watermarks=new Map<string,number>();
 async function tick(){if(busy)return;busy=true;try{const {data,error}=await db.from('rewards_partner_boss_credentials').select('broadcaster_id,provider,ciphertext,rewards_streamer_live_profiles!inner(status)').eq('rewards_streamer_live_profiles.status','approved');if(error)throw Error();const liveSockets=new Set<string>();
  for(const row of data||[]){const actor=row.broadcaster_id,provider=row.provider,tag=actor+':'+provider;try{const value=unseal(row.ciphertext);if(provider==='ihaq'){
   liveSockets.add(actor);if(sockets.get(actor)?.token===value)continue;sockets.get(actor)?.socket.disconnect();const socket=io('wss://ihaqdonate.com',{path:'/ws/integrations/socket.io/v1/'+value,transports:['polling','websocket'],reconnection:true,autoConnect:false});sockets.set(actor,{token:value,socket});socket.on('connect',()=>status.set(tag,'connected'));socket.on('disconnect',()=>status.set(tag,'disconnected'));socket.on('connect_error',()=>status.set(tag,'disconnected'));socket.on('message',(raw:unknown)=>{const event=normalizeIhaqEvent(raw);if(event)void apply(db,actor,{...event,p_source:'ihaq'}).catch(()=>console.error('partner_ihaq_event_failed'))});socket.connect();
  }else if(daReady){let t=value as Tokens;if(t.expires<Date.now()+60000){t=tokens(await daToken({grant_type:'refresh_token',refresh_token:t.refresh}),t.refresh);await save(actor,provider,t)}const response=await fetch('https://www.donationalerts.com/api/v1/alerts/donations',{headers:{Authorization:'Bearer '+t.access},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const body:any=await response.json();if(!Array.isArray(body.data))throw Error();const active=await db.from('rewards_partner_boss_runs').select('active_since').eq('broadcaster_id',actor).eq('status','active').maybeSingle();if(active.error)throw Error();if(active.data?.active_since){const from=Math.max(Date.parse(active.data.active_since),watermarks.get(actor)||0);const events=body.data.map(donationAlertEvent).filter(Boolean).filter((event:any)=>Date.parse(event.p_at)>=from).sort((a:any,b:any)=>Date.parse(a.p_at)-Date.parse(b.p_at));for(const event of events)await apply(db,actor,event);if(events.length)watermarks.set(actor,Math.max(from,Date.parse(events[events.length-1].p_at)-120000))}else watermarks.delete(actor);status.set(tag,'connected')}
  }catch{status.set(tag,'disconnected')}}for(const [actor,entry]of sockets)if(!liveSockets.has(actor)){entry.socket.disconnect();sockets.delete(actor)}
 }catch{console.error('partner_boss_provider_poll_failed')}finally{busy=false}}
 const timer=setInterval(()=>void tick(),15000);timer.unref();
}
