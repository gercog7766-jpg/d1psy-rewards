import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const DROPSO='https://dropso.site';
const CHANNEL='@dropso_cs2';
const noncePattern=/^[A-Za-z0-9_-]{32}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const idOk=id=>Number.isSafeInteger(id)&&id>0;

export function createRelay({token='',webhookSecret='',relaySecret='',webhookUrl='',fetcher=fetch,log=console}={}){
 const configured=/^\d+:[A-Za-z0-9_-]+$/.test(token)&&webhookSecret.length>=32&&relaySecret.length>=32&&/^https:\/\/[a-z0-9.-]+\.onrender\.com\/telegram-webhook$/.test(webhookUrl);
 const health={ok:true,configured,dropsoReachable:null,telegramReachable:null,webhookReady:false};
 async function tg(method,body={}){
  const response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});
  const data=await response.json();if(!response.ok||!data.ok)throw Error('telegram_api_failed');return data.result;
 }
 async function probe(){
  const probeUrl=async url=>{try{const r=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'manual'});return Boolean(r.status)}catch{return false}};
  [health.dropsoReachable,health.telegramReachable]=await Promise.all([probeUrl(DROPSO+'/health'),probeUrl('https://api.telegram.org')]);
  log.info('relay_connectivity',{dropsoReachable:health.dropsoReachable,telegramReachable:health.telegramReachable});
 }
 async function setup(){
  await probe();if(!configured)return;
  try{
   const previous=await tg('getWebhookInfo');
   if(previous.url&&previous.url!==webhookUrl&&previous.url!==DROPSO+'/api/bonuses/telegram/webhook'){log.warn('relay_webhook_conflict');return}
   // Replacing this integration's previous endpoint is intentional. Never replace unrelated webhooks.
   await tg('setWebhook',{url:webhookUrl,secret_token:webhookSecret,allowed_updates:['message','callback_query']});
   health.webhookReady=(await tg('getWebhookInfo')).url===webhookUrl;
   log.info('relay_webhook_ready',health.webhookReady);
  }catch{log.warn('relay_webhook_setup_failed')}
 }
 async function check(nonce,telegramId){
  const member=await tg('getChatMember',{chat_id:CHANNEL,user_id:telegramId});
  if(!['member','administrator','creator'].includes(member.status)&&!(member.status==='restricted'&&member.is_member))return 'not_subscribed';
  const response=await fetcher(DROPSO+'/api/bonuses/telegram/relay',{method:'POST',headers:{'Content-Type':'application/json','X-Dropso-Relay-Secret':relaySecret},body:JSON.stringify({tokenHash:hash(nonce),telegramId:String(telegramId)}),signal:AbortSignal.timeout(8000),redirect:'error'});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&result.ok&&result.claimed)return 'claimed';
  if(response.status===409&&['link_expired','telegram_already_used','user_unavailable'].includes(result.error))return result.error;
  throw Error('dropso_relay_failed');
 }
 async function process(update){
  const message=update?.message,callback=update?.callback_query;
  let nonce,id,chat;
  if(message?.chat?.type==='private'&&!message.from?.is_bot&&idOk(message.from?.id)&&message.chat.id===message.from.id){
   const match=typeof message.text==='string'&&/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{32})$/.exec(message.text);if(!match)return;
   nonce=match[1];id=message.from.id;chat=message.chat.id;
  }else if(callback?.message?.chat?.type==='private'&&!callback.from?.is_bot&&idOk(callback.from?.id)&&callback.message.chat.id===callback.from.id&&typeof callback.data==='string'&&callback.data.startsWith('check:')){
   nonce=callback.data.slice(6);if(!noncePattern.test(nonce))return;id=callback.from.id;chat=callback.message.chat.id;
   if(typeof callback.id==='string')await tg('answerCallbackQuery',{callback_query_id:callback.id}).catch(()=>{});
  }else return;
  const result=await check(nonce,id);
  const texts={claimed:'Готово! 10 монет начислены на Dropso. Вернись на сайт и обнови страницу бонусов.',link_expired:'Ссылка устарела. Открой бонусы Dropso и создай новую ссылку.',telegram_already_used:'Этот Telegram или аккаунт Dropso уже получал бонус.',user_unavailable:'Бонус недоступен для этого аккаунта.'};
  if(result==='not_subscribed')await tg('sendMessage',{chat_id:chat,text:'Подпишись на канал Dropso, затем нажми кнопку проверки.',reply_markup:{inline_keyboard:[[{text:'Подписаться на Dropso',url:'https://t.me/dropso_cs2'}],[{text:'Проверить подписку',callback_data:'check:'+nonce}]]}});
  else await tg('sendMessage',{chat_id:chat,text:texts[result],reply_markup:{inline_keyboard:[[{text:'Вернуться на Dropso',url:DROPSO+'/bonuses'}]]}});
 }
 function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,health);
  if(req.method!=='POST'||req.url!=='/telegram-webhook')return send(res,404,{error:'not_found'});
  if(!configured||!equal(req.headers['x-telegram-bot-api-secret-token'],webhookSecret))return send(res,403,{error:'forbidden'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'invalid_content_type'});
  let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return send(res,413,{error:'too_large'})}}catch{return send(res,400,{error:'invalid_request'})}
  let update;try{update=JSON.parse(raw)}catch{return send(res,400,{error:'invalid_request'})}
  try{await process(update);send(res,200,{ok:true})}catch{log.warn('relay_update_failed');send(res,503,{error:'temporarily_unavailable'})}
 });
 return {server,health,setup,process};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const relay=createRelay({token:process.env.TELEGRAM_BOT_TOKEN,webhookSecret:process.env.TELEGRAM_WEBHOOK_SECRET,relaySecret:process.env.DROPSO_RELAY_SECRET,webhookUrl:process.env.TELEGRAM_WEBHOOK_URL});
 relay.server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{console.info('telegram_relay_listening');void relay.setup()});
 process.on('SIGTERM',()=>relay.server.close());
}
