import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const payer={telegramId:z.string().regex(/^[1-9][0-9]{0,15}$/)};
const order={...payer,orderId:z.string().uuid()};
const amount={stars:z.number().int().min(1).max(100000),currency:z.literal('XTR')};
const commands=z.discriminatedUnion('action',[
 z.object({...payer,action:z.literal('create'),requestId:z.string().uuid(),product:z.enum(['lite','plus','battlePass'])}).strict(),
 z.object({...order,...amount,action:z.literal('precheckout'),precheckoutId:z.string().min(1).max(256)}).strict(),
 z.object({...order,...amount,action:z.literal('receipt'),chargeId:z.string().min(1).max(512)}).strict(),
 z.object({...order,...amount,action:z.literal('refund'),chargeId:z.string().min(1).max(512)}).strict(),
 z.object({...order,action:z.literal('prepare_refund')}).strict(),
 z.object({...payer,action:z.literal('support')}).strict()
]);
export function installStarsPilot(app:Express,db:SupabaseClient,admin:RequestHandler){
 const noStore:RequestHandler=(_q,r,next)=>{r.set('Cache-Control','private, no-store');next()};
 app.get('/admin/monetization/stars',noStore,admin,(_q,r)=>r.type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dropso · Telegram Stars</title><style>body{background:#13101e;color:#eee;font:16px system-ui;margin:0;padding:24px}main{max-width:800px;margin:auto}section{border:1px solid #68418a;border-radius:14px;padding:20px;margin:18px 0;background:#20182e}a{color:#c69aff}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:28px}</style><main><a href="/admin/monetization">← Монетизация</a><h1>Telegram Stars · ADMIN TEST</h1><section><strong id="status">Проверка состояния…</strong><p>Реальные платежи отдельно от тестовых. Не открывать продажи до выдачи прав и подключения поддержки.</p><p id="relay"></p></section><section><h2>Мои заказы</h2><div id="orders">Загрузка…</div></section></main><script src="/api/admin/monetization/stars-script"></script></html>`));
 app.get('/api/admin/monetization/stars-script',noStore,admin,(_q,r)=>r.type('application/javascript').send(`(async()=>{try{const res=await fetch('/api/admin/monetization/stars',{cache:'no-store'});if(!res.ok)throw Error();const d=await res.json();document.getElementById('status').textContent=d.control.enabled?'Пилот открыт':'Реальные оплаты отключены';document.getElementById('relay').textContent=d.relayConfigured?'Настройки relay найдены':'Relay не настроен';const orders=document.getElementById('orders');const section=document.createElement('section'),heading=document.createElement('h2');heading.textContent='Права по реальным платежам';section.append(heading);const add=t=>{const p=document.createElement('p');p.textContent=t;section.append(p)};const format=v=>new Date(v).toLocaleString('ru-RU');const e=d.entitlements;if(e){add('Статус: '+e.tier.toUpperCase()+(e.expiresAt?' · до '+format(e.expiresAt):''));add('Лимиты по тарифу: '+e.limits.coins+' монет / '+e.limits.skins+' стоимость скинов в сутки (пока не применяются к переводам)');for(const pass of e.battlePasses)add('PREMIUM · '+pass.season+' · до '+format(pass.until));if(!e.battlePasses.length)add('Нет активного премиального Battle Pass')}else add('Права пока недоступны');orders.parentElement.before(section);orders.textContent='';if(!d.orders.length)orders.textContent='Заказов пока нет';for(const o of d.orders){const p=document.createElement('p');p.textContent=o.product+' · '+o.stars+' Stars · '+o.state+' · '+o.id;orders.append(p)}}catch{document.getElementById('status').textContent='Статус недоступен'}})()`));
 app.get('/api/admin/monetization/stars',noStore,admin,async(_q,r)=>{
  const actor=r.locals.session.twitchUserId;
  const [control,orders]=await Promise.all([db.from('rewards_stars_pilot_control').select('enabled,fulfillment_ready,support_url').eq('id',true).single(),db.from('rewards_stars_pilot_orders').select('id,product,stars,state,created_at,paid_at,refunded_at').eq('actor',actor).order('created_at',{ascending:false}).limit(50)]);
  if(control.error||orders.error)return void r.status(503).json({error:'stars_unavailable'});
  const rights=await db.rpc('rewards_stars_entitlements',{p_actor:actor});
  r.json({control:control.data,orders:orders.data,entitlements:rights.error?null:rights.data,relayConfigured:Boolean(process.env.BONUS_TELEGRAM_RELAY_SECRET&&process.env.BONUS_TELEGRAM_BOT_USERNAME)});
 });
 app.post('/api/monetization/stars/relay',noStore,async(q,r)=>{
  const expected=process.env.BONUS_TELEGRAM_RELAY_SECRET||'',actual=q.get('X-Dropso-Relay-Secret')||'';
  if(expected.length<32||!process.env.BONUS_TELEGRAM_BOT_USERNAME||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return void r.sendStatus(403);
  if(!q.is('application/json'))return void r.sendStatus(415);
  const parsed=commands.safeParse(q.body);if(!parsed.success)return void r.status(400).json({error:'invalid_request'});
  const {action,telegramId,...body}=parsed.data;
  if(action==='support'){
   const {data,error}=await db.from('rewards_stars_pilot_control').select('support_url').eq('id',true).single();
   if(error)return void r.status(503).json({error:'stars_unavailable'});
   return void r.json({ok:true,url:data?.support_url||null});
  }
  const {data,error}=await db.rpc('rewards_stars_pilot_action',{p_telegram_id:telegramId,p_action:action,p_body:body});
  if(error){const known=['admin_required','pilot_disabled','product_not_in_test','order_already_exists','order_not_found','order_not_payable','amount_mismatch','request_conflict','rate_limit','refund_pending','order_not_paid','order_not_approved','invalid_receipt','season_not_open'];return void r.status(error.code==='P0001'&&known.includes(error.message)?409:503).json({error:known.includes(error.message)?error.message:'stars_unavailable'})}
  if(action==='create'){
   if(data.state!=='pending'||Date.parse(data.expires_at)<=Date.now())return void r.status(409).json({error:'order_not_payable'});
   const title=data.product==='lite'?'DROPSO LITE':data.product==='plus'?'DROPSO PLUS':'DROPSO Battle Pass';
   return void r.json({ok:true,invoice:{title,description:`${title} · ${data.product==='battlePass'?'до конца сезона':data.days+' дней'}. Реальная оплата Telegram Stars.`,payload:`stars_${data.id}`,currency:'XTR',prices:[{label:title,amount:data.stars}],start_parameter:`stars_${data.product}`}});
  }
  r.json({ok:true,order:{id:data.id,state:data.state,stars:data.stars,currency:data.currency,...(action==='prepare_refund'?{charge_id:data.charge_id}:{})}});
 });
}
