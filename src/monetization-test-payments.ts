import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {z} from 'zod';

const product=z.enum(['lite','plus','battlePass']);
const id=z.string().uuid();
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),product,requestId:id}).strict(),
 z.object({action:z.literal('precheckout'),orderId:id,stars:z.number().int().min(1).max(100000),currency:z.literal('XTR')}).strict(),
 z.object({action:z.literal('receipt'),orderId:id,stars:z.number().int().min(1).max(100000),currency:z.literal('XTR')}).strict(),
 z.object({action:z.literal('refund'),orderId:id}).strict()
]);
const knownErrors=new Set(['admin_required','invalid_request','request_conflict','product_not_in_test','test_rate_limit','pass_already_owned_or_pending','order_not_found','amount_mismatch','order_not_payable','invalid_receipt','order_not_approved','order_not_paid']);
const titles:Record<string,string>={lite:'DROPSO LITE',plus:'DROPSO PLUS',battlePass:'Battle Pass Premium'};
// Bot API invoice contract for the next, separately configured Telegram sandbox.
// It is intentionally not sent to a Telegram endpoint in this release.
export function testInvoice(order:{id:string;product:string;stars:number;days:number}){
 return {title:'TEST · '+titles[order.product],description:'Тестовый доступ Dropso на '+order.days+' дней. Не является реальной покупкой.',payload:'test_'+order.id,currency:'XTR',prices:[{label:titles[order.product],amount:order.stars}]};
}
type PaidRow={product:string;season:string;days:number;paid_at:string};
export function testEntitlements(rows:PaidRow[],now=Date.now()){
 const expiry:Record<string,number>={};
 for(const row of [...rows].sort((a,b)=>Date.parse(a.paid_at)-Date.parse(b.paid_at))){const at=Date.parse(row.paid_at),key=row.product==='battlePass'?'battlePass:'+row.season:row.product;if(!Number.isFinite(at))continue;expiry[key]=row.product==='battlePass'?(expiry[key]||at+row.days*86400000):Math.max(at,expiry[key]||0)+row.days*86400000}
 return Object.entries(expiry).map(([product,until])=>({product,until:new Date(until).toISOString(),active:until>now}));
}

export function installMonetizationTestPayments(app:Express,db:SupabaseClient,admin:RequestHandler,origin:string){
 const privateGet:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private,no-store');n()};
 app.get('/api/admin/monetization/test-payments',privateGet,admin,async(_q,r)=>{
  const actor=r.locals.session.twitchUserId;
  const [history,paid]=await Promise.all([db.from('rewards_monetization_test_orders').select('id,product,stars,state,created_at,expires_at,paid_at,refunded_at,season').eq('actor',actor).order('created_at',{ascending:false}).limit(50),db.from('rewards_monetization_test_orders').select('product,season,days,paid_at').eq('actor',actor).eq('state','paid').order('paid_at').limit(1000)]);
  if(history.error||paid.error)return void r.status(503).json({error:'test_ledger_unavailable'});
  r.json({orders:history.data||[],entitlements:testEntitlements(paid.data||[]),testOnly:true,livePayments:false});
 });
 app.post('/api/admin/monetization/test-payments',privateGet,admin,async(q,r)=>{
  if(q.get('origin')!==origin||!q.is('application/json'))return void r.sendStatus(403);
  const result=command.safeParse(q.body);if(!result.success)return void r.status(400).json({error:'invalid_request'});
  const {action,...body}=result.data;const actor=r.locals.session.twitchUserId;
  // Synthetic charge IDs cannot be confused with provider receipts. No provider request is made.
  const payload=result.data.action==='receipt'?{...body,chargeId:'test_'+createHash('sha256').update(actor+':'+result.data.orderId).digest('hex').slice(0,32)}:body;
  const {data,error}=await db.rpc('rewards_monetization_test_action',{p_actor:actor,p_action:action,p_body:payload});
  if(error){const reason=String(error.message);return void r.status(knownErrors.has(reason)?409:503).json({error:knownErrors.has(reason)?reason:'test_ledger_unavailable'})}
  r.json({order:data,...(action==='create'?{invoice:testInvoice(data)}:{}),testOnly:true,livePayments:false});
 });
}
