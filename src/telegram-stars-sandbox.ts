import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {testInvoice} from './monetization-test-payments.js';

const products={ '/lite':'lite','/plus':'plus','/pass':'battlePass'} as const;
const validId=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const payloadPattern=/^test_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function requestUuid(value:string){const hash=createHash('sha256').update(value).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`}
type Options={token:string;telegramId:number;actor:string;db:SupabaseClient;fetcher?:typeof fetch};
/** Official isolated Telegram test endpoint only. No production bot token fallback. */
export function createStarsSandbox({token,telegramId,actor,db,fetcher=fetch}:Options){
 if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!validId(telegramId)||!actor)throw Error('sandbox_not_configured');
 async function tg(method:string,body:Record<string,unknown>){
  const response=await fetcher(`https://api.telegram.org/bot${token}/test/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(method==='getUpdates'?28000:5000)});
  const result=await response.json();if(!response.ok||result.ok!==true)throw Error('sandbox_telegram_failed');return result.result;
 }
 async function act(action:string,body:Record<string,unknown>){const {data,error}=await db.rpc('rewards_monetization_test_action',{p_actor:actor,p_action:action,p_body:body});if(error)throw Error(String(error.message));return data;}
 const permitted=(from:any)=>from?.id===telegramId&&!from?.is_bot;
 const messageAllowed=(m:any)=>m?.chat?.type==='private'&&m.chat.id===telegramId&&permitted(m.from);
 const reply=(text:string)=>tg('sendMessage',{chat_id:telegramId,text});
 async function process(update:any){
  if(!Number.isSafeInteger(update?.update_id))return;
  const checkout=update.pre_checkout_query;
  if(checkout){
   if(typeof checkout.id!=='string'||checkout.id.length>256)return;
   const match=typeof checkout.invoice_payload==='string'&&payloadPattern.exec(checkout.invoice_payload);let ok=false;
   if(permitted(checkout.from)&&match&&checkout.currency==='XTR'&&Number.isSafeInteger(checkout.total_amount)&&checkout.total_amount>0){try{await act('precheckout',{orderId:match[1],stars:checkout.total_amount,currency:'XTR'});ok=true}catch{}}
   await tg('answerPreCheckoutQuery',{pre_checkout_query_id:checkout.id,ok,...(!ok?{error_message:'Тестовый счёт недоступен или сумма не совпадает.'}:{})});return;
  }
  const m=update.message;if(!messageAllowed(m))return;
  const receipt=m.successful_payment;
  if(receipt){const match=typeof receipt.invoice_payload==='string'&&payloadPattern.exec(receipt.invoice_payload);if(!match||receipt.currency!=='XTR'||!Number.isSafeInteger(receipt.total_amount)||receipt.total_amount<=0||typeof receipt.telegram_payment_charge_id!=='string'||!receipt.telegram_payment_charge_id||receipt.telegram_payment_charge_id.length>512)return;
   // Namespace provider sandbox receipts by their actual charge ID; no production entitlement is written.
   const chargeId='test_'+createHash('sha256').update('telegram-sandbox:'+receipt.telegram_payment_charge_id).digest('hex').slice(0,32);
   await act('receipt',{orderId:match[1],stars:receipt.total_amount,currency:'XTR',chargeId});await reply('TEST: квитанция сохранена. Реальные Stars и преимущества Dropso не затронуты.');return;
  }
  if(typeof m.text!=='string')return;
  const cmd=m.text.trim().split('@')[0];if(cmd==='/start'||cmd==='/help'){await reply('Dropso TEST. /lite · /plus · /pass. Только тестовая среда Telegram.');return;}
  if(!Object.hasOwn(products,cmd))return;
  const product=products[cmd as keyof typeof products];
  try{const order=await act('create',{product,requestId:requestUuid('telegram-sandbox:'+telegramId+':'+actor+':'+update.update_id)});if(order.state!=='pending'){await reply('TEST: этот счёт уже обработан.');return;}await tg('sendInvoice',{chat_id:telegramId,...testInvoice(order),start_parameter:'dropso_test'});}catch(error){if(['product_not_in_test','pass_already_owned_or_pending','test_rate_limit'].includes((error as Error).message)){await reply('TEST: тариф скрыт, уже куплен или достигнут лимит тестов.');return;}throw error;}
 }
 let offset=0;
 async function poll(){const updates=await tg('getUpdates',{offset,timeout:20,limit:20,allowed_updates:['message','pre_checkout_query']});if(!Array.isArray(updates))throw Error('sandbox_invalid_updates');for(const update of updates){await process(update);if(Number.isSafeInteger(update.update_id))offset=Math.max(offset,update.update_id+1);}}
 return {process,poll};
}

export function startStarsSandbox(db:SupabaseClient){
 if(process.env.DROPSO_STARS_SANDBOX_ENABLED!=='true')return;
 const token=process.env.DROPSO_STARS_SANDBOX_TOKEN||'',actor=process.env.DROPSO_STARS_SANDBOX_ACTOR||'',telegramId=Number(process.env.DROPSO_STARS_SANDBOX_TELEGRAM_ID);
 if(token===process.env.BONUS_TELEGRAM_BOT_TOKEN||token===process.env.TELEGRAM_BOT_TOKEN){console.warn('stars_sandbox_config_rejected');return;}
 let sandbox;try{sandbox=createStarsSandbox({token,actor,telegramId,db});}catch{console.warn('stars_sandbox_config_invalid');return;}
 const run=async()=>{let delay=100;try{await sandbox.poll()}catch{delay=5000;console.warn('stars_sandbox_poll_failed')}const timer=setTimeout(run,delay);timer.unref();};void run();
}
