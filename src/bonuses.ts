import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Express,RequestHandler,Response} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {bonusesHtml,bonusesJs} from './bonuses-ui.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const errors=new Set(['user_unavailable','bonus_cooldown','telegram_not_linked','telegram_already_used','invalid_request','vault_key_limit']);

export function installBonuses(app:Express,db:SupabaseClient,user:RequestHandler,origin:string,fetcher:typeof fetch=fetch){
 const token=process.env.BONUS_TELEGRAM_BOT_TOKEN||'';
 const username=(process.env.BONUS_TELEGRAM_BOT_USERNAME||'').replace(/^@/,'');
 const secret=process.env.BONUS_TELEGRAM_WEBHOOK_SECRET||'';
 const configured=Boolean(token&&/^[a-zA-Z0-9_]{5,32}$/.test(username)&&secret.length>=32);
 const noStore:RequestHandler=(_q,r,next)=>{r.set('Cache-Control','private, no-store');next()};
 const originCheck:RequestHandler=(q,r,next)=>{
  if(q.get('sec-fetch-site')==='cross-site'||q.get('origin')&&q.get('origin')!==origin||!q.is('application/json')){r.sendStatus(403);return}next();
 };
 const rates=new Map<string,{until:number;count:number}>();
 const throttle:RequestHandler=(_q,r,next)=>{
  const actor=r.locals.session.twitchUserId,now=Date.now(),entry=rates.get(actor);
  if(entry&&entry.until>now){if(++entry.count>30){r.status(429).json({error:'too_many_requests'});return}}
  else rates.set(actor,{until:now+60000,count:1});
  if(rates.size>2000)for(const [key,row] of rates)if(row.until<now)rates.delete(key);
  next();
 };
 async function rpc(actor:string,action:string,body:Record<string,unknown>={}){
  const {data,error}=await db.rpc('rewards_bonus_center',{p_actor:actor,p_action:action,p_body:body});
  if(error)throw error;return data;
 }
 function fail(r:Response,error:unknown){
  const reason=(error as {message?:string})?.message||'';
  if(!errors.has(reason)&&reason!=='telegram_unavailable')console.error('bonuses_failed',(error as {code?:string})?.code||'unknown');
  r.status(reason==='user_unavailable'?403:errors.has(reason)?409:503).json({error:errors.has(reason)||reason==='telegram_unavailable'?reason:'bonuses_unavailable'});
 }
 async function telegram(method:string,body:Record<string,unknown>){
  try{
   const response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
   const data=await response.json() as {ok:boolean;result:any};
   if(!response.ok||!data.ok)throw Error();return data.result;
  }catch{throw Error('telegram_unavailable')}
 }
 app.get('/bonuses',noStore,user,(_q,r)=>r.send(bonusesHtml));
 app.get('/bonuses.js',noStore,(_q,r)=>r.type('application/javascript').send(bonusesJs));
 app.get('/api/me/bonuses',noStore,user,async(_q,r)=>{
  try{r.json({...await rpc(r.locals.session.twitchUserId,'state'),telegramConfigured:configured})}catch(error){fail(r,error)}
 });
 app.post('/api/me/bonuses/claim',noStore,user,originCheck,throttle,async(q,r)=>{
  if(!q.body||Object.keys(q.body).length!==1||typeof q.body.requestId!=='string'||!uuid.test(q.body.requestId)){r.status(400).json({error:'invalid_request'});return}
  try{r.json(await rpc(r.locals.session.twitchUserId,'claim',{requestId:q.body.requestId}))}catch(error){fail(r,error)}
 });
 app.post('/api/me/bonuses/telegram/:action',noStore,user,originCheck,throttle,async(q,r)=>{
  if(!configured){r.status(503).json({error:'telegram_not_configured'});return}
  if(!q.body||Object.keys(q.body).length||!['link','claim'].includes(String(q.params.action))){r.status(400).json({error:'invalid_request'});return}
  const actor=r.locals.session.twitchUserId;
  try{
   if(q.params.action==='link'){
    const nonce=randomBytes(24).toString('base64url');
    const result=await rpc(actor,'telegram_link',{tokenHash:hash(nonce)});
    r.json({...result,url:result.claimed?null:'https://t.me/'+username+'?start='+nonce});return;
   }
   const state=await rpc(actor,'state');
   if(state.telegramClaimed){r.json({ok:true,claimed:true,amount:10});return}
   const {data:player,error:playerError}=await db.from('rewards_users').select('id').eq('twitch_user_id',actor).single();
   if(playerError||!player)throw Error('bonuses_unavailable');
   const {data:link,error:linkError}=await db.from('rewards_bonus_telegram_links').select('telegram_id').eq('user_id',player.id).maybeSingle();
   if(linkError)throw Error('bonuses_unavailable');
   if(!link?.telegram_id)throw Error('telegram_not_linked');
   const member=await telegram('getChatMember',{chat_id:'@dropso_cs2',user_id:Number(link.telegram_id)});
   if(!['member','administrator','creator'].includes(member.status)&&!(member.status==='restricted'&&member.is_member)){
    r.status(409).json({error:'telegram_not_subscribed'});return;
   }
   r.json(await rpc(actor,'telegram_claim',{telegramId:link.telegram_id}));
  }catch(error){fail(r,error)}
 });
 app.post('/api/bonuses/telegram/webhook',noStore,async(q,r)=>{
  const supplied=q.get('X-Telegram-Bot-Api-Secret-Token')||'';
  if(!configured||Buffer.byteLength(supplied)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(secret))){r.sendStatus(403);return}
  const message=q.body?.message;
  const match=typeof message?.text==='string'&&/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{32})$/.exec(message.text);
  if(!match||message.chat?.type!=='private'||message.from?.is_bot||!Number.isSafeInteger(message.from?.id)||message.from.id<=0){r.sendStatus(200);return}
  try{
   await rpc('','telegram_bind',{tokenHash:hash(match[1]),telegramId:String(message.from.id)});
   await telegram('sendMessage',{chat_id:message.chat.id,text:'Аккаунт Dropso привязан. Подпишись на https://t.me/dropso_cs2 и нажми «Проверить и забрать» на странице бонусов.'});
   r.sendStatus(200);
  }catch(error){
   const reason=(error as {message?:string})?.message;
   if(reason==='link_expired'||(error as {code?:string})?.code==='23505'){r.sendStatus(200);return}
   r.sendStatus(503);
  }
 });
}
