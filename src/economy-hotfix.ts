import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installEconomyHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalListen=proto.listen;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state') handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){const originalJson=res.json.bind(res);res.json=(body:any)=>{if(body&&Array.isArray(body.wins)){const all=body.wins;body={...body,historyWins:all,wins:all.filter((w:any)=>w.choice_status==='claimed')}}return originalJson(body)};return handler(req,res,next)});
  if(path==='/account') handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){const originalSend=res.send.bind(res);res.send=(body:any)=>{if(typeof body==='string'&&body.includes('Твой инвентарь'))body=enhanceAccount(body);return originalSend(body)};return handler(req,res,next)});
  return originalGet.call(this,path,...handlers);
 };
 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__economyRoutesInstalled){
   app.locals.__economyRoutesInstalled=true;
   const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
   const secret=process.env.SESSION_SECRET||'';
   const session=(req:any)=>{try{const raw=req.cookies?.rewards_session;if(!raw||!secret)return null;const [p,s]=raw.split('.');const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');if(!p||!s||Buffer.byteLength(s)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;const v=JSON.parse(Buffer.from(p,'base64url').toString());return v.exp>Date.now()?v:null}catch{return null}};
   const user=async(req:any,res:any)=>{const s=session(req);if(!s){res.status(401).json({error:'authentication_required'});return null}const {data}=await db.from('rewards_users').select('id').eq('twitch_user_id',s.twitchUserId).single();if(!data){res.status(404).json({error:'user_not_found'});return null}return data};
   app.get('/api/me/economy',async(req:any,res:any)=>{const u=await user(req,res);if(!u)return;const [{data:tx},{data:shop}]=await Promise.all([db.from('rewards_coin_transactions').select('amount').eq('user_id',u.id),db.from('rewards_shop_items').select('id,name,image_url,price_coins,stock').eq('status','available').order('created_at',{ascending:false})]);const balance=(tx||[]).reduce((n:number,x:any)=>n+Number(x.amount||0),0);res.set('Cache-Control','no-store');res.json({balance,currency:'Монета',shop:shop||[]})});
  }
  return originalListen.apply(this,args);
 };
}

function enhanceAccount(body:string){
 body=body.replace('</style>',`.economybar{display:flex;gap:10px;align-items:center;margin-top:16px}.coinbox,.shoplink{border:1px solid #3b2853;background:#171020;border-radius:12px;padding:10px 14px}.coinbox b{color:#fcd34d}.shoplink{color:#fff;text-decoration:none;cursor:pointer}.actions{display:flex;gap:8px;margin-top:12px}.actions button{flex:1;border:0;border-radius:9px;padding:9px 10px;font-weight:800;cursor:pointer}.claim{background:#6d28d9;color:#fff}.sell{background:#2b203c;color:#fcd34d}.shopgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:14px}.shopitem{border:1px solid #342449;border-radius:14px;padding:14px;background:#120d1b}.shopitem img{width:100%;height:110px;object-fit:contain}.coinprice{color:#fcd34d;font-weight:850;margin-top:8px}</style>`);
 body=body.replace('<div id="who" class="user">Загрузка…</div></div>','<div><div id="who" class="user">Загрузка…</div><div class="economybar"><div class="coinbox">Баланс: <b id="coinBalance">…</b></div><a class="shoplink" href="#shop">Магазин</a></div></div></div>');
 body=body.replace('<section class="card trade-card">','<section id="shop" class="card"><h2>Магазин</h2><div class="muted">Скины за Монеты. Товары добавим после настройки цен.</div><div id="shopGrid" class="shopgrid"><div class="empty">Магазин пока пуст.</div></div></section><section class="card trade-card">');
 body=body.replace("var p=w.rewards_prizes||{},name=p.name||'Приз',received=w.delivery_status==='received',img=", "var p=w.rewards_prizes||{},name=p.name||'Приз',received=w.delivery_status==='received',choice=w.choice_status||'claimed',price=p.sell_price_coins,img=");
 body=body.replace("'<div class=\"item-body\"><div class=\"item-name\">'+esc(name)+'</div></div><div class=\"item-date\">'", "'<div class=\"item-body\"><div class=\"item-name\">'+esc(name)+'</div>'+(choice==='awaiting_choice'&&!received?'<div class=\"actions\"><button class=\"claim\" data-claim=\"'+esc(w.id)+'\">Забрать</button><button class=\"sell\" data-sell=\"'+esc(w.id)+'\" '+(price==null?'disabled':'')+'>'+(price==null?'Цена скоро':'Продать · '+esc(price)+' Монеты')+'</button></div>':'')+'</div><div class=\"item-date\">'");
 body=body.replace("+(received?'Получено':'Ожидает отправки')+", "+(choice==='sold'?'Продано':received?'Получено':choice==='awaiting_choice'?'Выбери действие':'Ожидает отправки')+");
 body=body.replace("}).join('')}function renderStatus", "}).join('');document.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>chooseWin(b.dataset.claim,'claim'));document.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>chooseWin(b.dataset.sell,'sell'))}function renderStatus");
 body=body.replace("renderWins(wr.ok?await wr.json():[])", "renderWins(wr.ok?await wr.json():[]);await loadEconomy()");
 body=body.replace("async function save(){", "function coinWord(n){n=Math.abs(Number(n))%100;var n1=n%10;return n>10&&n<20?'Монет':n1===1?'Монета':n1>=2&&n1<=4?'Монеты':'Монет'}async function loadEconomy(){var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'});if(er.ok){var e=await er.json();document.getElementById('coinBalance').textContent=e.balance+' '+coinWord(e.balance);renderShop(e.shop||[])}}function renderShop(list){var el=document.getElementById('shopGrid');el.innerHTML=list.length?list.map(x=>'<div class=\"shopitem\">'+(x.image_url?'<img src=\"'+esc(x.image_url)+'\" alt=\"\">':'')+'<b>'+esc(x.name)+'</b><div class=\"coinprice\">'+esc(x.price_coins)+' '+coinWord(x.price_coins)+'</div></div>').join(''):'<div class=\"empty\">Магазин пока пуст.</div>'}async function chooseWin(id,action){var text=action==='claim'?'Забрать этот скин? После подтверждения он появится у администратора на отправку.':'Продать этот скин за Монеты? Действие нельзя отменить.';if(!confirm(text))return;var r=await fetch('/api/me/wins/'+encodeURIComponent(id)+'/'+action,{method:'POST'});if(!r.ok){var j=await r.json().catch(()=>({}));alert(j.error&&String(j.error).includes('win_not_available')?'Этот скин уже выдан или действие с ним недоступно.':'Не удалось выполнить действие.');return}await loadEconomy();await load()}async function save(){");
 return body;
}
