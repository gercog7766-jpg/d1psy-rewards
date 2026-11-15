import {installPromoHistory} from './promo-history.js';
import express from 'express';
import {promoRewardBrowserScript,promoRewardTypes} from './promo-rewards.js';
import {threeDoorsStakes} from './three-doors.js';
import { createClient } from '@supabase/supabase-js';
const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
export function installPromoCodeHotfix(){const p:any=(express as any).application,og=p.get,ol=p.listen;let userAuth:any=null,adminAuth:any=null;
p.get=function(path:any,...hs:any[]){if(path==='/api/me'&&hs.length>1)userAuth=hs[0];if(path==='/api/admin/state'&&hs.length>1)adminAuth=hs[0];return og.call(this,path,...hs)};
p.listen=function(...args:any[]){const app:any=this;if(!app.locals.__promo&&userAuth&&adminAuth){app.locals.__promo=true;
 installPromoHistory(app,db,adminAuth);
 app.post('/api/me/promo/redeem',userAuth,async(req:any,res:any)=>{
  res.set('Cache-Control','private, no-store');
  const origin=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;
  if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==origin))return res.sendStatus(403);
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if(!req.is('application/json')||!code||code.length>64)return res.status(400).json({error:'invalid_code'});
  const {data,error}=await db.rpc('rewards_redeem_owner_promo',{p_actor:res.locals.session.twitchUserId,p_code:code});
  if(!error)return res.json(data);
  const statuses:Record<string,number>={promo_not_found:404,user_not_found:404,user_unavailable:403,
    expired:409,limit_reached:409,new_users_only:409,already_used:409,major_already_active:409,
    major_closed:409,vault_closed:409,vault_key_limit:409,invalid_prize:409};
  const status=statuses[error.message];
  if(!status)console.error('owner_promo_redeem',error.code);
  return res.status(status||503).json({error:status?error.message:'reward_failed'});
 });
 app.get('/api/admin/promos',adminAuth,async(_q:any,res:any)=>{const {data,error}=await db.from('rewards_promo_codes').select('id,code,reward_type,coin_amount,prize_id,reward_amount,max_activations,activation_count,active,created_at,expires_at,new_users_only').is('archived_at',null).order('created_at',{ascending:false});if(error)return res.status(500).json({error:'load_failed'});res.json({promos:data||[]})});
 app.post('/api/admin/promos',adminAuth,async(req:any,res:any)=>{
  const code=String(req.body?.code||'').trim().toUpperCase(),type=req.body?.rewardType,
   max=Number(req.body?.maxActivations),coins=Number(req.body?.coinAmount),amount=Number(req.body?.rewardAmount),
   prize=String(req.body?.prizeId||''),expiresRaw=String(req.body?.expiresAt||'').trim();
  if(typeof type!=='string'||!Object.hasOwn(promoRewardTypes,type)||code.startsWith('STR-')||! /^[A-Z0-9_-]{3,32}$/.test(code)
    || !Number.isInteger(max)||max<1||max>100000)return res.status(400).json({error:'invalid_input'});
  let expiresAt:string|null=null;
  if(expiresRaw){
   const date=new Date(expiresRaw);
   if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())return res.status(400).json({error:'invalid_expiration'});
   expiresAt=date.toISOString();
  }
  const skin=type==='prize'||type==='upgrade_skin';
  const hasAmount=type==='vault_keys'||type==='three_doors_pass'||type==='pick_credit';
  if(type==='coins'&&(!Number.isInteger(coins)||coins<1||coins>100000))return res.status(400).json({error:'invalid_coins'});
  if(hasAmount&&(!Number.isInteger(amount)||amount<1||amount>(type==='vault_keys'?10000:100000)
    ||(type==='three_doors_pass'&&!threeDoorsStakes.includes(amount))))return res.status(400).json({error:'invalid_reward_amount'});
  if(skin){
   if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(prize))return res.status(400).json({error:'invalid_prize'});
   const {data,error}=await db.from('rewards_prizes').select('id,sell_price_coins').eq('id',prize).maybeSingle();
   if(error)return res.status(503).json({error:'load_failed'});
   if(!data||(type==='upgrade_skin'&&!(data.sell_price_coins>0)))return res.status(400).json({error:'invalid_prize'});
  }
  const {error}=await db.from('rewards_promo_codes').insert({
   code,reward_type:type,coin_amount:type==='coins'?coins:null,prize_id:skin?prize:null,reward_amount:hasAmount?amount:null,
   max_activations:max,expires_at:expiresAt,new_users_only:req.body?.newUsersOnly===true,
  });
  if(error)return res.status(error.code==='23505'?409:503).json({error:error.code==='23505'?'code_exists':'create_failed'});
  res.json({ok:true});
 });
 app.post('/api/admin/promos/:id/cancel',adminAuth,async(req:any,res:any)=>{const id=String(req.params.id||'');const {data,error}=await db.from('rewards_promo_codes').update({active:false}).eq('id',id).eq('active',true).select('id,code').maybeSingle();if(error)return res.status(500).json({error:'cancel_failed'});if(!data)return res.status(409).json({error:'already_inactive'});res.json({ok:true,code:data.code})});
 app.post('/api/admin/promos/:id/delete',adminAuth,async(req:any,res:any)=>{
  const id=String(req.params.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'invalid_id'});
  const {error,data}=await db.from('rewards_promo_codes').update({archived_at:new Date().toISOString()}).eq('id',id).is('archived_at',null).select('id').maybeSingle();
  if(error)return res.status(409).json({error:String(error.message||'').includes('promo_still_active')?'promo_still_active':'delete_failed'});
  if(!data)return res.status(404).json({error:'promo_not_found'});res.json({ok:true});
 });
 app.get('/api/admin/promo-prizes',adminAuth,async(_q:any,res:any)=>{const {data}=await db.from('rewards_prizes').select('id,name,sell_price_coins').eq('status','available').order('name');res.json({prizes:data||[]})});
 }
 const response:any=(express as any).response,send=response.send;if(!response.__promoSend){response.__promoSend=true;response.send=function(body:any){if(typeof body==='string'){if(body.includes('D1PSY REWARDS')&&body.includes('Рефералы')&&!body.includes('promoOpen'))body=injectUser(body);if(body.includes('Розыгрыши')&&body.includes('Пользователи')&&!body.includes('promoAdminTab'))body=injectAdmin(body)}return send.call(this,body)}}return ol.apply(this,args)};
}
function injectUser(b:string){const modal='<div id="promoModal" style="display:none;position:fixed;inset:0;background:#000a;z-index:9999;align-items:center;justify-content:center"><div style="width:min(420px,92vw);background:#15101e;border:1px solid #4b2c68;border-radius:16px;padding:20px"><div style="display:flex;justify-content:space-between"><b>Промокод</b><button id="promoClose" type="button">×</button></div><p class="muted">Введите промокод и получите награду.</p><input id="promoInput" placeholder="Введите промокод" style="width:100%;box-sizing:border-box;padding:11px;border-radius:10px;background:#0d0912;color:#fff;border:1px solid #3b2853"><div id="promoMsg" class="muted" style="margin:10px 0"></div><button id="promoRedeem" type="button">Активировать</button></div></div>';b=b.replace('>Рефералы</a>','>Рефералы</a><button id="promoOpen" type="button">Промокод</button>');b=b.replace('</body>',modal+'<script>(function(){'+promoRewardBrowserScript+'var m=document.getElementById("promoModal"),o=document.getElementById("promoOpen"),c=document.getElementById("promoClose"),r=document.getElementById("promoRedeem"),i=document.getElementById("promoInput"),x=document.getElementById("promoMsg");if(o)o.onclick=function(){m.style.display="flex";i.focus()};if(c)c.onclick=function(){m.style.display="none"};if(r)r.onclick=async function(){r.disabled=true;x.textContent="Проверяем…";var q=await fetch("/api/me/promo/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:i.value})}),j=await q.json().catch(function(){return{}});if(q.ok){x.textContent=promoRewardMessage(j);setTimeout(function(){location.reload()},900)}else{x.textContent=promoErrorMessage(j.error);r.disabled=false}}})();</script></body>');return b}
function injectAdmin(b:string){const panel='<section id="promoAdminTab" style="margin-top:18px;border:1px solid #3b2853;border-radius:14px;padding:16px"><h3>Промокоды</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="paCode" placeholder="Промокод"><input id="paMax" type="number" min="1" placeholder="Активаций"><select id="paType">'+Object.entries(promoRewardTypes).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select><input id="paCoins" type="number" min="1" placeholder="Монет"><select id="paStake" aria-label="Стоимость входа в Три двери" style="display:none">'+threeDoorsStakes.map(value=>'<option value="'+value+'">'+value+' монет</option>').join('')+'</select><select id="paPrize" style="display:none"></select><input id="paExpires" type="datetime-local" title="Действует до (необязательно)"><label style="display:flex;align-items:center;gap:6px;padding:0 8px"><input id="paNewUsers" type="checkbox"> Только для новых</label><button id="paCreate">Создать</button></div><div class="muted" style="margin-top:6px">Срок действия — необязательно. «Только для новых» разрешает активацию только аккаунтам, созданным после промокода.</div><div id="paMsg" class="muted" style="margin:8px 0"></div><div id="paList"></div></section>';b=b.replace('</main>',panel+'</main>');return b}
