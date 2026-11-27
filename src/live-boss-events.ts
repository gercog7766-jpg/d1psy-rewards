import express from 'express';
import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {randomBytes,createHmac,timingSafeEqual,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {isClanSiteOwner} from './clan-owner-view.js';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const id=/^[0-9]{1,30}$/;
export function donationCode(message:unknown){const matches=typeof message==='string'?[...message.matchAll(/\[DROPSO:([0-9a-f-]{36})\]/gi)]:[];return matches.length===1&&uuid.test(matches[0][1])?matches[0][1].toLowerCase():null}
export function twitchBossEvent(type:string,event:any,eventId:string,at:string){
 if(!event||!id.test(event.broadcaster_user_id||'')||!eventId||!Number.isFinite(Date.parse(at)))return null;
 if(type==='channel.subscribe'&&event.is_gift===false&&id.test(event.user_id||''))return {p_source:'subscription',p_event:eventId,p_actor:event.user_id,p_at:at};
 if(type==='channel.subscription.gift'&&Number.isInteger(event.total)&&event.total>0&&event.total<=1000)return {p_source:'gift',p_event:eventId,p_actor:event.is_anonymous?null:id.test(event.user_id||'')?event.user_id:null,p_gifts:event.total,p_at:at};
 return null;
}
export function donationAlertEvent(row:any){
 if(!row||row.name!=='donation'||!/^\d{1,30}$/.test(String(row.id))||row.currency!=='RUB'||row.is_test===true||row.is_test===1||row.is_manual===true||row.is_manual===1)return null;
 const amount=Number(row.amount);if(!Number.isFinite(amount)||amount<0.5||amount>10000000)return null;
 const date=String(row.created_at||'');const at=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(date)?date.replace(' ','T')+'Z':date;
 if(!Number.isFinite(Date.parse(at))||!/^\d{4}-\d\d-\d\dT/.test(at)||!/(?:Z|[+-]\d\d:\d\d)$/.test(at))return null;
 return {p_source:'donationalerts',p_event:String(row.id),p_actor:null,p_donor:String(row.username||'').slice(0,100),p_rub:amount,p_code:donationCode(row.message),p_at:new Date(at).toISOString(),p_confirmed:false};
}
const ignored=new Set(['boss_inactive','event_outside_battle']);
async function apply(db:SupabaseClient,args:any){const {error}=await db.rpc('rewards_boss_hit',args);if(error&&!ignored.has(error.message))throw Error(error.code||'boss_hit_failed')}
type ProviderState='not_configured'|'not_connected'|'checking'|'connected'|'disconnected'|'partial'|'pending'|'reconnect_required';
type ProviderStatus={status:ProviderState;checkedAt:string|null;details?:string};
let daStatus:ProviderStatus={status:'not_configured',checkedAt:null};
function setDaStatus(status:ProviderState,details?:string){daStatus={status,checkedAt:new Date().toISOString(),details}}
export function bossDonationAlertsStatus(){return daStatus.status==='connected'&&Date.now()-Date.parse(daStatus.checkedAt||'')>45000?{...daStatus,status:'disconnected' as const}:daStatus}
const twitchTypes=['channel.subscribe','channel.subscription.gift'] as const;
export async function inspectBossTwitchSubscriptions(actor:string,callback:string,headers:Record<string,string>,request:typeof fetch=fetch):Promise<ProviderStatus>{
 const found=await Promise.all(twitchTypes.map(async type=>{
  let after='',enabled=false,pending=false;
  for(let page=0;page<20;page++){
   const q=new URLSearchParams({type,...(after?{after}:{})});
   const r=await request('https://api.twitch.tv/helix/eventsub/subscriptions?'+q,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('twitch_status_unavailable');
   const data:any=await r.json();if(!Array.isArray(data.data))throw Error('twitch_status_invalid');
   for(const s of data.data)if(s.type===type&&s.condition?.broadcaster_user_id===actor&&s.transport?.method==='webhook'&&s.transport?.callback===callback){enabled||=s.status==='enabled';pending||=s.status==='webhook_callback_verification_pending'}
   const cursor=data.pagination?.cursor;if(enabled||!cursor)return enabled?'enabled':pending?'pending':'missing';if(cursor===after)throw Error('twitch_status_pagination');after=cursor;
  }
  throw Error('twitch_status_limit');
 }));
 const count=found.filter(s=>s==='enabled').length;
 return {status:count===2?'connected':found.includes('pending')?'pending':count===1?'partial':'not_connected',checkedAt:new Date().toISOString(),details:count+' из 2 событий подписок'};
}
let twitchStatusReader:(actor:string)=>ProviderStatus=()=>({status:'not_configured',checkedAt:null});
let invalidateTwitchStatus=()=>{};
export function bossTwitchStatus(actor:string){return twitchStatusReader(actor)}
// Separate callback avoids changing the existing chat, giveaway and partner subscriptions.
export function installBossTwitchWebhook(app:Express,db:SupabaseClient,secret:string){
 app.post('/eventsub/boss',express.raw({type:'application/json',limit:'64kb'}),async(q,r)=>{
  if(!secret)return void r.sendStatus(503);
  const eventId=q.get('Twitch-Eventsub-Message-Id')||'',at=q.get('Twitch-Eventsub-Message-Timestamp')||'',sig=q.get('Twitch-Eventsub-Message-Signature')||'',kind=q.get('Twitch-Eventsub-Message-Type')||'';
  if(!eventId||eventId.length>200||!Buffer.isBuffer(q.body)||!Number.isFinite(Date.parse(at))||Math.abs(Date.now()-Date.parse(at))>600000)return void r.sendStatus(400);
  const expected='sha256='+createHmac('sha256',secret).update(eventId+at).update(q.body).digest('hex');
  if(!/^sha256=[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return void r.sendStatus(403);
  try{const p=JSON.parse(q.body.toString('utf8')),type=p.subscription?.type,broadcaster=p.subscription?.condition?.broadcaster_user_id;
   if(!['channel.subscribe','channel.subscription.gift'].includes(type)||!id.test(broadcaster||'')||!await isClanSiteOwner(db,broadcaster))return void r.sendStatus(403);
   if(kind==='webhook_callback_verification'&&typeof p.challenge==='string')return void r.type('text/plain').send(p.challenge);
   if(kind==='revocation'){invalidateTwitchStatus();return void r.sendStatus(204)}
   if(kind==='notification'&&p.event?.broadcaster_user_id===broadcaster){const hit=twitchBossEvent(type,p.event,eventId,at);if(hit)await apply(db,hit)}
   r.sendStatus(204);
  }catch{r.sendStatus(503)}
 });
}
type TwitchOptions={clientId:string;clientSecret:string;secret:string;redirect:string;callback:string};
export function installBossTwitchConnect(app:Express,db:SupabaseClient,admin:RequestHandler,o:TwitchOptions){
 const pending=new Map<string,{actor:string;expires:number}>();const scope='channel:read:subscriptions';
 let last:ProviderStatus={status:'checking',checkedAt:null},expires=0,checking=false,checkedActor='',generation=0;
 invalidateTwitchStatus=()=>{generation++;expires=0;last={status:'checking',checkedAt:null}};
 twitchStatusReader=actor=>{
  if(!o.clientId||!o.clientSecret||!o.secret)return {status:'not_configured',checkedAt:null};
  if(checkedActor!==actor){checkedActor=actor;invalidateTwitchStatus()}
  if(!checking&&Date.now()>=expires){checking=true;const current=generation;void(async()=>{
   try{const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:o.clientId,client_secret:o.clientSecret,grant_type:'client_credentials'}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const token=(await r.json() as any).access_token;if(!token)throw Error();
    const result=await inspectBossTwitchSubscriptions(actor,o.callback,{'Client-Id':o.clientId,Authorization:'Bearer '+token});
    if(current===generation){last=result;expires=Date.now()+30000}
   }catch{if(current===generation){last={status:'disconnected',checkedAt:new Date().toISOString()};expires=Date.now()+15000}}finally{checking=false}
  })()}
  if(last.status==='connected'&&Date.now()-Date.parse(last.checkedAt||'')>90000)return {...last,status:'disconnected'};
  return last;
 };
 const owner:RequestHandler=async(_q,r,n)=>{try{if(!await isClanSiteOwner(db,r.locals.session.twitchUserId))return void r.sendStatus(403);r.set('Cache-Control','no-store');n()}catch{r.sendStatus(503)}};
 app.get('/admin/bosses/twitch',admin,owner,(_q,r)=>{
  if(!o.clientId||!o.clientSecret||!o.secret)return void r.status(503).send('Twitch не настроен');
  for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);if(pending.size>=20)return void r.sendStatus(429);
  const state='boss-sub-'+randomBytes(24).toString('hex');pending.set(state,{actor:r.locals.session.twitchUserId,expires:Date.now()+600000});
  r.cookie('boss_sub_oauth',state,{httpOnly:true,secure:o.redirect.startsWith('https:'),sameSite:'lax',maxAge:600000,path:'/auth/twitch/callback'});
  r.redirect('https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({client_id:o.clientId,redirect_uri:o.redirect,response_type:'code',scope:'user:read:chat user:bot channel:bot moderator:read:chatters '+scope,force_verify:'true',state}));
 });
 app.use((q,r,n)=>{
  const state=typeof q.query.state==='string'?q.query.state:'';
  if(q.method!=='GET'||q.path!=='/auth/twitch/callback'||!state.startsWith('boss-sub-'))return n();
  admin(q,r,()=>owner(q,r,async()=>{
   const entry=pending.get(state);pending.delete(state);r.clearCookie('boss_sub_oauth',{path:'/auth/twitch/callback'});
   if(!entry||entry.expires<Date.now()||entry.actor!==r.locals.session.twitchUserId||q.cookies?.boss_sub_oauth!==state||typeof q.query.code!=='string')return void r.status(400).send('Авторизация не завершена');
   const token=async(args:Record<string,string>)=>{const response=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:o.clientId,client_secret:o.clientSecret,...args}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();return response.json() as Promise<any>};
   try{const u=await token({grant_type:'authorization_code',code:q.query.code,redirect_uri:o.redirect});if(!u.scope?.includes(scope)||!u.access_token)throw Error();
    const identity=await fetch('https://api.twitch.tv/helix/users',{headers:{'Client-Id':o.clientId,Authorization:'Bearer '+u.access_token},signal:AbortSignal.timeout(10000)});if(!identity.ok||(await identity.json() as any).data?.[0]?.id!==entry.actor)return void r.sendStatus(403);
    const a=await token({grant_type:'client_credentials'});if(!a.access_token)throw Error();
    const headers={'Client-Id':o.clientId,Authorization:'Bearer '+a.access_token,'Content-Type':'application/json'};
    for(const type of twitchTypes){
     const response=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers,body:JSON.stringify({type,version:'1',condition:{broadcaster_user_id:entry.actor},transport:{method:'webhook',callback:o.callback,secret:o.secret}}),signal:AbortSignal.timeout(10000)});
     if(response.status===409){const existing=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions?'+new URLSearchParams({type}),{headers,signal:AbortSignal.timeout(10000)});if(!existing.ok||!(await existing.json() as any).data?.some((s:any)=>s.condition?.broadcaster_user_id===entry.actor&&s.transport?.callback===o.callback&&['enabled','webhook_callback_verification_pending'].includes(s.status)))throw Error()}
     else if(!response.ok)throw Error();
    }
    invalidateTwitchStatus();r.redirect('/admin/bosses');
   }catch{r.status(503).send('Не удалось подключить подписки Twitch. Проверь разрешения и повтори.')}
  }));
 });
}
// DonationAlerts list access is opt-in; use a server-only OAuth access token.
// Never poll widget URLs. API provides alerts, not a settlement guarantee.
export function startBossDonationAlerts(db:SupabaseClient,getToken:()=>Promise<string|null>){
 let busy=false,activeWindow='',seen=new Set<string>();
 const tick=async()=>{if(busy)return;busy=true;try{
  const accessToken=await getToken();if(!accessToken){setDaStatus('not_connected');return}
  const response=await fetch('https://www.donationalerts.com/api/v1/alerts/donations',{headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(10000)});
  if(response.status===401||response.status===403){setDaStatus('reconnect_required');return}
  if(!response.ok)throw Error('da_api_unavailable');const payload:any=await response.json();if(!Array.isArray(payload.data))throw Error('da_api_invalid');
  const events=payload.data.map(donationAlertEvent).filter(Boolean).sort((a:any,b:any)=>Date.parse(a.p_at)-Date.parse(b.p_at));
  let eligible=0,processed=0;
  if(events.length){
   const {data:run,error}=await db.from('rewards_boss_runs').select('id,active_since').eq('status','active').maybeSingle();
   if(error)throw Error('da_battle_lookup_failed');
   const window=run?.active_since?run.id+':'+run.active_since:'';
   if(window!==activeWindow){activeWindow=window;seen.clear()}
   if(window){
    const since=Date.parse(run.active_since);
    for(const event of events){
     if(Date.parse(event.p_at)<since||Date.parse(event.p_at)>Date.now()+30000)continue;
     eligible++;
     if(seen.has(event.p_event))continue;
     await apply(db,event);seen.add(event.p_event);processed++;
    }
    if(seen.size>1000)seen=new Set(events.map((e:any)=>e.p_event).filter((id:string)=>seen.has(id)));
   }
  }
  setDaStatus('connected','API: '+payload.data.length+' · RUB: '+events.length+' · в бою: '+eligible+' · проверено: '+processed);
 }catch(e){setDaStatus('disconnected');console.error('live_boss_donation_alerts_unavailable',e instanceof Error?e.message:'unknown')}finally{busy=false}};
 const t=setInterval(()=>void tick(),10000);t.unref();void tick();return ()=>clearInterval(t);
}
type DaOptions={clientId:string;clientSecret:string;encryptionKey:string;redirect:string;poll?:boolean};
type DaTokens={access:string;refresh:string;expires:number};
function seal(value:DaTokens,key:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64')}
function unseal(value:string,key:Buffer):DaTokens{const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'))}
export function installBossDonationAlertsOAuth(app:Express,db:SupabaseClient,admin:RequestHandler,o:DaOptions){
 const configured=!!(o.clientId&&o.clientSecret&&o.encryptionKey),key=createHash('sha256').update(o.encryptionKey||'disabled').digest();
 setDaStatus(configured?'checking':'not_configured');
 const scope='oauth-donation-index',pending=new Map<string,{actor:string;expires:number}>();let cached:DaTokens|null=null;
 const owner:RequestHandler=async(_q,r,n)=>{try{if(!await isClanSiteOwner(db,r.locals.session.twitchUserId))return void r.sendStatus(403);r.set('Cache-Control','no-store');n()}catch{r.sendStatus(503)}};
 const exchange=async(args:Record<string,string>)=>{const response=await fetch('https://www.donationalerts.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:o.clientId,client_secret:o.clientSecret,scope,...args}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('da_token_failed');return response.json() as Promise<any>};
 const save=async(value:any,oldRefresh='')=>{if(typeof value.access_token!=='string'||!value.access_token||!Number.isFinite(Number(value.expires_in))||Number(value.expires_in)<=0)throw Error('da_token_invalid');const tokens={access:value.access_token,refresh:value.refresh_token||oldRefresh,expires:Date.now()+Number(value.expires_in)*1000};if(!tokens.refresh)throw Error('da_refresh_missing');const {error}=await db.from('rewards_boss_provider_credentials').upsert({provider:'donationalerts',ciphertext:seal(tokens,key),updated_at:new Date().toISOString()},{onConflict:'provider'});if(error)throw Error('da_token_store_failed');cached=tokens;return tokens};
 app.get('/admin/bosses/donationalerts',admin,owner,(_q,r)=>{
  if(!configured)return void r.status(503).send('Для подключения DonationAlerts задай BOSS_DA_CLIENT_ID, BOSS_DA_CLIENT_SECRET и BOSS_DA_ENCRYPTION_KEY на сервере.');
  for(const [k,v] of pending)if(v.expires<Date.now())pending.delete(k);if(pending.size>=20)return void r.sendStatus(429);
  const state=randomBytes(24).toString('hex');pending.set(state,{actor:r.locals.session.twitchUserId,expires:Date.now()+600000});r.cookie('boss_da_oauth',state,{httpOnly:true,secure:o.redirect.startsWith('https:'),sameSite:'lax',maxAge:600000,path:'/auth/boss/donationalerts'});
  r.redirect('https://www.donationalerts.com/oauth/authorize?'+new URLSearchParams({client_id:o.clientId,redirect_uri:o.redirect,response_type:'code',scope,state}));
 });
 app.get('/auth/boss/donationalerts',admin,owner,async(q,r)=>{
  const state=typeof q.query.state==='string'?q.query.state:'',entry=pending.get(state);pending.delete(state);r.clearCookie('boss_da_oauth',{path:'/auth/boss/donationalerts'});
  if(!configured||!entry||entry.actor!==r.locals.session.twitchUserId||entry.expires<Date.now()||q.cookies?.boss_da_oauth!==state||typeof q.query.code!=='string')return void r.status(400).send('Авторизация не завершена');
  try{await save(await exchange({grant_type:'authorization_code',code:q.query.code,redirect_uri:o.redirect}));setDaStatus('checking');r.redirect('/admin/bosses')}catch{setDaStatus('disconnected');r.status(503).send('Не удалось подключить DonationAlerts')}
 });
 if(configured&&o.poll!==false)startBossDonationAlerts(db,async()=>{
  if(!cached){const row=await db.from('rewards_boss_provider_credentials').select('ciphertext').eq('provider','donationalerts').maybeSingle();if(row.error)throw Error('da_token_lookup_failed');if(!row.data)return null;cached=unseal(row.data.ciphertext,key)}
  if(cached.expires<Date.now()+60000)await save(await exchange({grant_type:'refresh_token',refresh_token:cached.refresh}),cached.refresh);
  return cached.access;
 });
}
