import express from 'express';

export function installAdminOrdersUiHotfix(){
 const proto:any=(express as any).application;
 const originalSend=proto.response.send;
 proto.response.send=function(body:any){
  if(typeof body==='string' && body.includes('<title>Rewards Admin</title>') && !body.includes('id="orders"')){
   const card='<div class="card"><h2>Заказы</h2><div id="orders" class="history muted">Загрузка…</div></div>';
   body=body.replace('</section>\n<section id="page-users"',card+'</section>\n<section id="page-users"');
   const js=`\nfunction renderOrders(list){let el=$('orders');if(!el)return;el.innerHTML=list&&list.length?list.map(o=>{let u=o.rewards_users||{},src=o.source_type==='shop'?'Магазин':'Выигрыш',sent=o.status==='sent';return '<div class="historyRow" style="grid-template-columns:1.2fr 1.5fr 1fr 2fr 1fr auto"><div><b>'+esc(u.twitch_display_name||u.twitch_login||'—')+'</b><div class="muted">@'+esc(u.twitch_login||'—')+'</div></div><div>'+esc(o.item_name||'Предмет')+'</div><div>'+src+'</div><div class="trade">'+esc(u.steam_trade_url_valid?(u.steam_trade_url||'—'):'Trade URL не добавлен')+'</div><div>'+fmt(o.created_at)+'</div><div>'+(sent?'<span class="pill good">Отправлено</span>':'<button onclick="markOrderSent(\\''+o.id+'\\')">Отправлено</button>')+'</div></div>'}).join(''):'Заказов пока нет'}\nasync function markOrderSent(id){let r=await fetch('/api/admin/orders/'+encodeURIComponent(id)+'/sent',{method:'POST'});if(!r.ok){let j=await r.json().catch(()=>({}));alert('Ошибка: '+(j.error||r.status));return}load()}\n`;
   body=body.replace('function renderUsers(){',js+'function renderUsers(){');
   body=body.replace('renderUsers()}catch(e)',"renderUsers();renderOrders(s.orders||[])}catch(e)");
  }
  return originalSend.call(this,body);
 };
}
