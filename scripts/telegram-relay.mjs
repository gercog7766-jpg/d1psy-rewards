import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const DROPSO='https://dropso.site';
const menuRows = [['⚡ DROPSO LITE', '💎 DROPSO PLUS'], ['🌃 Battle Pass'], ['👤 Профиль', '🎁 Бонусы', '💬 Помощь']];
const menuCards = new Map([
 [menuRows[0][0], ['⚡ <b>DROPSO LITE</b> · 249 ⭐ за 30 дней', '50 приветственных монет при первой покупке. Оформление профиля, скидка 1% в магазине и 2% на Battle Pass. Лимит передачи монет — 100 в сутки.']],
 [menuRows[0][1], ['💎 <b>DROPSO PLUS</b> · 399 ⭐ за 30 дней', '100 приветственных монет суммарно (при переходе с LITE ещё 50). Анимированная рамка, расширенная статистика и оформление клана. Скидка 2% в магазине и 5% на Battle Pass.']],
 [menuRows[1][0], ['🌃 <b>NIGHT SHIFT · Сезон 02</b>', '50 уровней за 90 дней. В финале FREE — Tec-9 «Оранжевое Мурано», в PREMIUM — ★ Водительские перчатки «Гоночный зелёный». Базовая цена PREMIUM — 499 ⭐ за сезон.']],
 [menuRows[2][0], ['👤 <b>Мой профиль</b>', '<a href="https://dropso.site/account">Открыть личный кабинет Dropso</a>']],
 [menuRows[2][1], ['🎁 <b>Бонусы</b>', '<a href="https://dropso.site/bonuses">Перейти к бонусам Dropso</a>']],
 [menuRows[2][2], ['💬 <b>Помощь</b>', 'По вопросам оплаты отправь /paysupport. Чтобы вернуться в меню, отправь /start.']]
]);
const CHANNEL='@dropso_cs2';
const noncePattern=/^[A-Za-z0-9_-]{32}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const idOk=id=>Number.isSafeInteger(id)&&id>0;

export function createRelay({token='',webhookSecret='',relaySecret='',webhookUrl='',fetcher=fetch,log=console}={}){
 const configured=/^\d+:[A-Za-z0-9_-]+$/.test(token)&&webhookSecret.length>=32&&relaySecret.length>=32&&/^https:\/\/[a-z0-9.-]+\.onrender\.com\/telegram-webhook$/.test(webhookUrl);
 const health={ok:true,configured,dropsoReachable:null,telegramReachable:null,webhookReady:false,starsProtocol:'stars-v1',starsReachable:null,starsWebhookReady:false};
 async function tg(method,body={},timeout=8000){
  const response=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
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
   await tg('setWebhook',{url:webhookUrl,secret_token:webhookSecret,allowed_updates:['message','callback_query','pre_checkout_query']});
   const info=await tg('getWebhookInfo');health.webhookReady=info.url===webhookUrl;health.starsWebhookReady=health.webhookReady&&Array.isArray(info.allowed_updates)&&info.allowed_updates.includes('pre_checkout_query');
   log.info('relay_webhook_ready',health.webhookReady);
  }catch{log.warn('relay_webhook_setup_failed')}
  await probeStars();
 }
 async function probeStars(){try{const response=await fetcher(DROPSO+'/api/monetization/stars/relay',{method:'POST',headers:{'Content-Type':'application/json','X-Dropso-Relay-Secret':relaySecret},body:JSON.stringify({action:'probe'}),signal:AbortSignal.timeout(6000),redirect:'error'});const data=await response.json();health.starsReachable=response.ok&&data.ok===true&&data.protocol==='stars-v1'}catch{health.starsReachable=false}log.info('relay_stars_ready',{server:health.starsReachable,webhook:health.starsWebhookReady});}
 async function check(nonce,telegramId){
  const member=await tg('getChatMember',{chat_id:CHANNEL,user_id:telegramId});
  if(!['member','administrator','creator'].includes(member.status)&&!(member.status==='restricted'&&member.is_member))return 'not_subscribed';
  const response=await fetcher(DROPSO+'/api/bonuses/telegram/relay',{method:'POST',headers:{'Content-Type':'application/json','X-Dropso-Relay-Secret':relaySecret},body:JSON.stringify({tokenHash:hash(nonce),telegramId:String(telegramId)}),signal:AbortSignal.timeout(8000),redirect:'error'});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&result.ok&&result.claimed)return 'claimed';
  if(response.status===409&&['link_expired','telegram_already_used','user_unavailable'].includes(result.error))return result.error;
  throw Error('dropso_relay_failed');
 }
 const orderId=payload=>typeof payload==='string'&&/^stars_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload)?payload.slice(6):null;
 async function stars(action,id,body={},timeout=5000){
  const response=await fetcher(DROPSO+'/api/monetization/stars/relay',{method:'POST',headers:{'Content-Type':'application/json','X-Dropso-Relay-Secret':relaySecret},body:JSON.stringify({action,telegramId:String(id),...body}),signal:AbortSignal.timeout(timeout),redirect:'error'});
  const data=await response.json();if(response.ok&&data.ok)return data;if(response.status===409)return data;throw Error('stars_unavailable');
 }
 async function starsUpdate(update){
  const p=update?.pre_checkout_query;
  if(p){const id=orderId(p.invoice_payload);if(!id)return false;let ok=false;
   if(idOk(p.from?.id)&&!p.from.is_bot&&p.currency==='XTR'&&Number.isInteger(p.total_amount))try{ok=Boolean((await stars('precheckout',p.from.id,{orderId:id,precheckoutId:p.id,stars:p.total_amount,currency:p.currency},3000)).ok)}catch{}
   await tg('answerPreCheckoutQuery',{pre_checkout_query_id:p.id,ok,...(!ok?{error_message:'Оплата недоступна. Открой новый счёт в Dropso.'}:{})},4000);return true;
  }
  const m=update?.message;if(m?.chat?.type!=='private'||!idOk(m.chat.id))return false;
  const payment=m.successful_payment||m.refunded_payment;
  if(payment){const id=orderId(payment.invoice_payload);if(!id)return false;
   if(m.successful_payment&&m.from?.id!==m.chat.id)throw Error('invalid_payer');
   const result=await stars(m.refunded_payment?'refund':'receipt',m.chat.id,{orderId:id,chargeId:payment.telegram_payment_charge_id,stars:payment.total_amount,currency:payment.currency});if(!result.ok)throw Error('receipt_not_recorded');return true;
  }
  if(m.from?.is_bot||m.from?.id!==m.chat.id||typeof m.text!=='string')return false;
  if(/^\/start(?:@[A-Za-z0-9_]+)? stars_check$/.test(m.text)){
   const result=await stars('check',m.chat.id).catch(()=>null);const text=result?.ok?'Dropso: связь со Stars работает. Аккаунт администратора привязан. '+(result.enabled?'Пилот включён.':'Оплаты закрыты.')+' '+(result.supportConfigured?'Поддержка настроена.':'Поддержка платежей ещё не настроена.')+' Звёзды не списывались.':result?.error==='admin_required'?'Проверка доступна только привязанному администратору Dropso.':'Не удалось проверить связь. Попробуй позднее.';await tg('sendMessage',{chat_id:m.chat.id,text});return true;
  }
  const cmd=/^\/start(?:@[A-Za-z0-9_]+)? stars_(lite|plus|battlePass)$/.exec(m.text);
  if(cmd){if(!Number.isSafeInteger(update.update_id))return true;const h=hash('stars:'+m.chat.id+':'+update.update_id);const requestId=[h.slice(0,8),h.slice(8,12),'4'+h.slice(13,16),'8'+h.slice(17,20),h.slice(20,32)].join('-');
   const result=await stars('create',m.chat.id,{product:cmd[1],requestId});if(result.ok)await tg('sendInvoice',{chat_id:m.chat.id,...result.invoice});else await tg('sendMessage',{chat_id:m.chat.id,text:'Оплата пока недоступна или счёт уже открыт.'});return true;
  }
  if(/^\/paysupport(?:@[A-Za-z0-9_]+)?$/.test(m.text)){const result=await stars('support',m.chat.id).catch(()=>null);await tg('sendMessage',{chat_id:m.chat.id,text:'Поддержка платежей Dropso: '+(result?.url||DROPSO)});return true;}
  const refund=/^\/refund_stars ([0-9a-f-]{36})$/i.exec(m.text);
  if(refund&&orderId('stars_'+refund[1])){const result=await stars('prepare_refund',m.chat.id,{orderId:refund[1]});if(!result.ok||result.order.state==='refunded'){await tg('sendMessage',{chat_id:m.chat.id,text:'Возврат недоступен или уже выполнен.'});return true;}
   const o=result.order;await tg('refundStarPayment',{user_id:m.chat.id,telegram_payment_charge_id:o.charge_id});const saved=await stars('refund',m.chat.id,{orderId:o.id,chargeId:o.charge_id,stars:o.stars,currency:o.currency});if(!saved.ok)throw Error('refund_not_recorded');return true;
  }
  return false;
 }
 async function process(update){
  if(await starsUpdate(update))return;
  const message=update?.message,callback=update?.callback_query;
  let nonce,id,chat;
  if(message?.chat?.type==='private'&&!message.from?.is_bot&&idOk(message.from?.id)&&message.chat.id===message.from.id){
   const welcome = /^\/start(?:@[A-Za-z0-9_]+)?$/.test(message.text);
   const card = welcome ? ['👋 <b>Добро пожаловать в Dropso!</b>', 'Выбери подписку, чтобы посмотреть её возможности, или загляни в Battle Pass за наградами сезона.'] : menuCards.get(message.text);
   if (card) {
    await tg('sendMessage', {
     chat_id: message.chat.id, text: card.join('\n\n'), parse_mode: 'HTML',
     reply_markup: {keyboard: menuRows.map(row => row.map(text => ({text}))), resize_keyboard: true}
    });
    return;
   }
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
 return {server,health,setup,process,probeStars};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const relay=createRelay({token:process.env.TELEGRAM_BOT_TOKEN,webhookSecret:process.env.TELEGRAM_WEBHOOK_SECRET,relaySecret:process.env.DROPSO_RELAY_SECRET,webhookUrl:process.env.TELEGRAM_WEBHOOK_URL});
 relay.server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>{console.info('telegram_relay_listening');void relay.setup();if(relay.health.configured)setInterval(()=>void relay.probeStars(),300000).unref()});
 process.on('SIGTERM',()=>relay.server.close());
}
