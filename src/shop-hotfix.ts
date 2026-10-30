import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

async function currentUser(req:any,res:any){
 try{
  const secret=process.env.SESSION_SECRET||'';
  const raw=req.cookies?.rewards_session;
  if(!raw||!secret){res.status(401).json({error:'authentication_required'});return null}
  const [p,s]=raw.split('.');
  if(!p||!s){res.status(401).json({error:'authentication_required'});return null}
  const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  if(Buffer.byteLength(s)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))){res.status(401).json({error:'authentication_required'});return null}
  const session=JSON.parse(Buffer.from(p,'base64url').toString());
  if(session.exp<=Date.now()){res.status(401).json({error:'authentication_required'});return null}
  const {data,error}=await db.from('rewards_users').select('id,steam_trade_url_valid').eq('twitch_user_id',session.twitchUserId).single();
  if(error||!data){res.status(404).json({error:'user_not_found'});return null}
  return data;
 }catch{res.status(401).json({error:'authentication_required'});return null}
}

export function installShopHotfix(){
 const proto:any=(express as any).application;
 const response:any=(express as any).response;
 const originalListen=proto.listen;
 const originalSend=response.send;

 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Личный кабинет — d1psy Rewards</title>')&&body.includes('function renderShop(list)')){
   body=body.replace('.coinprice{color:#fcd34d;font-weight:850;margin-top:8px}', '.coinprice{color:#fcd34d;font-weight:850;margin:0;white-space:nowrap}.shopgrid{display:flex!important;flex-direction:column;gap:8px}.shopitem{display:grid;grid-template-columns:64px minmax(0,1fr) auto 110px;align-items:center;gap:14px;min-height:0!important;padding:10px 12px!important}.shopitem img{width:64px!important;height:52px!important;object-fit:contain}.shopitem .item-name{font-size:14px}.buybtn{width:110px;border:0;border-radius:9px;padding:9px 10px;background:#6d28d9;color:#fff;font-weight:850;cursor:pointer}.buybtn:disabled{opacity:.45;cursor:not-allowed}@media(max-width:620px){.shopitem{grid-template-columns:54px minmax(0,1fr) auto;gap:9px}.shopitem img{width:54px!important;height:46px!important}.buybtn{grid-column:2/4;width:100%}}');
   body=body.replace("function renderShop(list){shopGrid.innerHTML=Array.isArray(list)&&list.length?list.map(x=>'<article class=\"shopitem\">'+(x.image_url?'<img src=\"'+esc(x.image_url)+'\" alt=\"'+esc(x.name)+'\">':'')+'<div class=\"item-name\">'+esc(x.name)+'</div><div class=\"coinprice\">'+esc(x.price_coins)+' '+coinWord(x.price_coins)+'</div></article>').join(''):'<div class=\"empty\">Магазин пока пуст.</div>'}", "function renderShop(list){var sorted=Array.isArray(list)?list.slice().sort((a,b)=>Number(a.price_coins)-Number(b.price_coins)||String(a.name).localeCompare(String(b.name),'ru')):[];shopGrid.innerHTML=sorted.length?sorted.map(x=>'<article class=\"shopitem\">'+(x.image_url?'<img src=\"'+esc(x.image_url)+'\" alt=\"'+esc(x.name)+'\">':'<div></div>')+'<div class=\"item-name\">'+esc(x.name)+'</div><div class=\"coinprice\">'+esc(x.price_coins)+' '+coinWord(x.price_coins)+'</div><button class=\"buybtn\" data-buy=\"'+esc(x.id)+'\">Купить</button></article>').join(''):'<div class=\"empty\">Магазин пока пуст.</div>';document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buyShopItem(b.dataset.buy,b))}async function buyShopItem(id,btn){if(!confirm('Купить этот предмет за Монеты?'))return;btn.disabled=true;var r=await fetch('/api/me/shop/'+encodeURIComponent(id)+'/buy',{method:'POST'});var j=await r.json().catch(()=>({}));if(!r.ok){btn.disabled=false;alert(j.error==='insufficient_coins'?'Недостаточно Монет.':j.error==='out_of_stock'?'Товар закончился.':j.error==='trade_url_required'?'Сначала добавь Steam Trade URL.':'Не удалось купить предмет.');return}alert('Покупка оформлена. Предмет появился в инвентаре.');await load()}");
   body=body.replace('Скины за Монеты. Ассортимент добавим после настройки цен.','Скины за Монеты. Позиции отсортированы от меньшей стоимости к большей.');
   body=body.replace("renderWins(wr.ok?await wr.json():[]);var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'});if(er.ok){var e=await er.json();coinBalance.textContent=e.balance+' '+coinWord(e.balance);renderShop(e.shop||[])}", "var wins=wr.ok?await wr.json():[];var er=await fetch('/api/me/economy?ts='+Date.now(),{cache:'no-store'});if(er.ok){var e=await er.json();coinBalance.textContent=e.balance+' '+coinWord(e.balance);renderShop(e.shop||[]);var purchases=(e.purchases||[]).map(o=>({id:'shop-'+o.id,won_at:o.created_at,delivery_status:o.status==='sent'?'received':'purchased',choice_status:'shop_purchase',rewards_prizes:{name:o.item_name,image_url:o.image_url}}));renderWins([...(Array.isArray(wins)?wins:[]),...purchases])}else renderWins(wins)");
   body=body.replace("badge=choice==='sold'?'<span class=\"badge sold\">Продано</span>':received?'<span class=\"badge received\">Получено</span>':choice==='awaiting_choice'?'<span class=\"badge pending\">Выбери действие</span>':'<span class=\"badge '+(received?'received':'pending')+'\">'+(received?'Получено':'Ожидает отправки')+'</span>';", "badge=choice==='shop_purchase'?'<span class=\"badge '+(received?'received':'pending')+'\">'+(received?'Получен':'Куплен')+'</span>':choice==='sold'?'<span class=\"badge sold\">Продано</span>':received?'<span class=\"badge received\">Получено</span>':choice==='awaiting_choice'?'<span class=\"badge pending\">Выбери действие</span>':'<span class=\"badge '+(received?'received':'pending')+'\">'+(received?'Получено':'Ожидает отправки')+'</span>'; ");
  }
  return originalSend.call(this,body);
 };

 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__shopRoutesInstalled){
   app.locals.__shopRoutesInstalled=true;
   app.get('/api/me/economy',async(req:any,res:any)=>{
    const u=await currentUser(req,res);if(!u)return;
    const [{data:tx,error:tErr},{data:shop,error:sErr},{data:purchases,error:pErr}]=await Promise.all([
     db.from('rewards_coin_transactions').select('amount').eq('user_id',u.id),
     db.from('rewards_shop_items').select('id,name,image_url,price_coins,stock').eq('status','available').order('price_coins',{ascending:true}).order('name',{ascending:true}),
     db.from('rewards_orders').select('id,item_name,image_url,price_coins,status,created_at,sent_at').eq('user_id',u.id).eq('source_type','shop').order('created_at',{ascending:false})
    ]);
    if(tErr||sErr||pErr)return res.status(500).json({error:'shop_load_failed'});
    const balance=(tx||[]).reduce((n:number,x:any)=>n+Number(x.amount||0),0);
    res.set('Cache-Control','no-store');
    return res.json({balance,currency:'Монета',shop:shop||[],purchases:purchases||[]});
   });
   app.post('/api/me/shop/:id/buy',async(req:any,res:any)=>{
    const u=await currentUser(req,res);if(!u)return;
    if(!u.steam_trade_url_valid)return res.status(409).json({error:'trade_url_required'});
    const {data,error}=await db.rpc('rewards_purchase_shop_item',{p_shop_item_id:req.params.id,p_user_id:u.id});
    if(error){
     const m=String(error.message||'');
     if(m.includes('insufficient_coins'))return res.status(409).json({error:'insufficient_coins'});
     if(m.includes('out_of_stock'))return res.status(409).json({error:'out_of_stock'});
     if(m.includes('item_not_available'))return res.status(409).json({error:'item_not_available'});
     return res.status(409).json({error:'purchase_failed'});
    }
    return res.json({ok:true,orderId:data});
   });
  }
  return originalListen.apply(this,args);
 };
}
