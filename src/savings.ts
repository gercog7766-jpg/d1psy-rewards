import {fileURLToPath} from 'node:url';
import type {Express,RequestHandler,Response} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {savingsPage,savingsScript} from './savings-ui.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^#[0-9a-f]{6}$/i;
const known=new Set(['invalid_request','participation_restricted','insufficient_coins','already_active','cycle_not_ready','invalid_goal','user_required','admin_required']);

export function installSavings(app:Express,db:SupabaseClient,user:RequestHandler,admin:RequestHandler,origin:string){
 const noStore:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','no-store');n()};
 const fail=(res:Response,error:{message:string;code:string})=>{
  if(known.has(error.message))return res.status(error.message==='admin_required'?403:error.message==='user_required'?401:error.message==='participation_restricted'?403:409).json({error:error.message});
  console.error('personal_savings_db',error.code);return res.status(503).json({error:'unavailable'});
 };
 const rpc=async(res:Response,actor:string,action:string,body:any={})=>{
  const {data,error}=await db.rpc('rewards_personal_savings_rpc',{p_actor:actor,p_action:action,p_body:body});
  if(error)return fail(res,error);res.json(data);
 };
 app.get('/savings',noStore,user,(_q,r)=>r.send(savingsPage(false)));
 app.get('/piggy-bank',noStore,user,(_q,r)=>r.redirect(302,'/savings'));
 app.get('/admin/savings',noStore,admin,(_q,r)=>r.send(savingsPage(true)));
 app.get('/admin/piggy-bank',noStore,admin,(_q,r)=>r.redirect(302,'/admin/savings'));
 app.get('/savings/assets/:file',(q,r)=>{
  const files:Record<string,string>={'pig.webp':'pig.webp','glasses.webp':'glasses.webp','crown.webp':'crown.webp'};
  const file=files[q.params.file];if(!file)return r.sendStatus(404);
  r.type('webp').set('Cache-Control','public,max-age=31536000,immutable').sendFile(fileURLToPath(new URL('../public/savings/'+file,import.meta.url)));
 });
 app.get('/savings.js',(_q,r)=>r.type('application/javascript').set('Cache-Control','no-cache').send(savingsScript));
 app.get('/api/savings',noStore,user,async(_q,r)=>rpc(r,r.locals.session.twitchUserId,'state'));
 app.post('/api/savings/:action',noStore,user,async(q,r)=>{
  if(q.get('origin')!==origin||!q.is('application/json'))return r.status(403).json({error:'invalid_request'});
  const b=q.body,a=String(q.params.action);
  if(!b||Array.isArray(b)||typeof b!=='object')return r.status(400).json({error:'invalid_request'});
  if(a==='colors'){
   const keys=['pig','glasses','crown'];if(Object.keys(b).length!==keys.length||keys.some(k=>!hex.test(b[k])))return r.status(400).json({error:'invalid_request'});
  }else if(['start','extend'].includes(a)){
   const goalKeys=b.goalType==='amount'?['goalType','amount','requestId']:['goalType','goalAt','requestId'];
   if(Object.keys(b).length!==goalKeys.length||Object.keys(b).some(k=>!goalKeys.includes(k))||!uuid.test(b.requestId))return r.status(400).json({error:'invalid_request'});
   if(b.goalType==='amount'){
    if(typeof b.amount!=='string'||!/^[1-9]\d{0,18}$/.test(b.amount)||BigInt(b.amount)>9223372036854775807n||BigInt(b.amount)<500n)return r.status(400).json({error:'invalid_request'});
   }else if(b.goalType==='date'){
    if(typeof b.goalAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(b.goalAt)||!Number.isFinite(Date.parse(b.goalAt))||Date.parse(b.goalAt)<Date.now()+10*86400000)return r.status(400).json({error:'invalid_request'});
   }else return r.status(400).json({error:'invalid_request'});
  }else if(a==='deposit'){
   if(Object.keys(b).length!==2||typeof b.amount!=='string'||!/^[1-9]\d{0,18}$/.test(b.amount)||BigInt(b.amount)>9223372036854775807n||!uuid.test(b.requestId))return r.status(400).json({error:'invalid_request'});
  }else if(a==='break'){
   if(Object.keys(b).length!==1||!uuid.test(b.requestId))return r.status(400).json({error:'invalid_request'});
  }else return r.status(404).json({error:'invalid_request'});
  return rpc(r,r.locals.session.twitchUserId,a,b);
 });
 app.get('/api/admin/savings',noStore,admin,async(_q,r)=>rpc(r,r.locals.session.twitchUserId,'admin_state'));
 // Finish any old shared-piggy entries already accepted before this feature replaced it.
 let settling=false;
 setInterval(async()=>{if(settling)return;settling=true;try{const {error}=await db.rpc('rewards_piggy_close');if(error&&error.code!=='PGRST202')console.error('legacy_piggy_settlement',error.code)}catch(e){console.error('legacy_piggy_settlement',e)}finally{settling=false}},10000).unref();
}
