import express from 'express';

export function installAdminOrdersFinalHotfix(){
 const response:any=(express as any).response;
 const originalSend=response.send;
 response.send=function(body:any){
  if(typeof body==='string' && body.includes('<title>Rewards Admin</title>') && !body.includes('id="orders"')){
   const card='<div class="card"><h2>Заказы</h2><div class="muted" style="margin-bottom:12px">Заявки после «Забрать» и покупки из магазина.</div><div id="orders" class="history muted">Загрузка…</div></div>';
   const marker='<section id="page-users"';
   if(body.includes(marker)) body=body.replace(marker,card+'<section id="page-users"');
   const js=`\nfunction renderOrdersFinal(list){let el=$('orders');if(!el)return;list=Array.isArray(list)?list:[];el.innerHTML=list.length?list.map(o=>{let u=o.rewards_users||{},pending=o.status==='pending',src=o.source_type==='shop'?'Магазин':'Выигрыш';return '<div class="historyRow" style="grid-template-columns:1.2fr 1.5fr 1fr 2fr 1fr auto;align-items:center"><div><b>'+esc(u.twitch_display_name||u.twitch_login||'—')+'</b><div class="muted">@'+esc(u.twitch_login||'—')+'</div></div><div><b>'+esc(o.item_name||'Предмет')+'</b></div><div>'+src+'</div><div class="trade">'+esc(u.steam_trade_url_valid?(u.steam_trade_url||'—'):'Trade URL не добавлен')+'</div><div>'+fmt(o.created_at)+'</div><div>'+(pending?'<button onclick="markOrderSentFinal(\\''+esc(o.id)+'\\')">Отправлено</button>':'<span class="pill good">Отправлено</span>')+'</div></div>'}).join(''):'Заказов пока нет'}\nasync function markOrderSentFinal(id){if(!confirm('Отметить заказ как отправленный?'))return;let r=await fetch('/api/admin/orders/'+encodeURIComponent(id)+'/sent',{method:'POST'});let j=await r.json().catch(()=>({}));if(!r.ok){alert('Ошибка: '+(j.error||r.status));return}load()}\n`;
   if(body.includes('function renderUsers(){')) body=body.replace('function renderUsers(){',js+'function renderUsers(){');
   if(body.includes('renderUsers()}catch(e)')) body=body.replace('renderUsers()}catch(e)','renderUsers();renderOrdersFinal(s.orders||[])}catch(e)');
  }
  return originalSend.call(this,body);
 };
}
