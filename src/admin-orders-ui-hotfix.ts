import express from 'express';

export function installAdminOrdersUiHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/admin' && handlers.length){
   const last=handlers.length-1;
   const originalHandler=handlers[last];
   handlers[last]=function(req:any,res:any,next:any){
    const originalSend=res.send.bind(res);
    res.send=(body:any)=>originalSend(typeof body==='string'?injectOrders(body):body);
    return originalHandler(req,res,next);
   };
  }
  return originalGet.call(this,path,...handlers);
 };
}

function injectOrders(body:string){
 if(!body.includes('<title>Rewards Admin</title>') || body.includes('id="orders"')) return body;
 const history='<div class="card"><h2>Последние розыгрыши</h2><div id="history" class="history muted">Загрузка…</div></div>';
 const orders='<div class="card"><h2>Заказы</h2><div class="muted" style="margin-bottom:12px">Заявки после «Забрать» и покупки из магазина.</div><div id="orders" class="history muted">Загрузка…</div></div>';
 body=body.replace(history,history+orders);
 const render=`function renderOrders(list){let el=$('orders');if(!el)return;list=Array.isArray(list)?list:[];el.innerHTML=list.length?list.map(o=>{let u=o.rewards_users||{},pending=o.status==='pending',src=o.source_type==='shop'?'Магазин':'Выигрыш',trade=u.steam_trade_url_valid?u.steam_trade_url:'';return '<div class="historyRow" style="grid-template-columns:1.1fr 1.5fr .8fr 1.2fr 1fr auto"><div><b>'+esc(u.twitch_display_name||u.twitch_login||'—')+'</b><div class="muted">@'+esc(u.twitch_login||'—')+'</div></div><div><b>'+esc(o.item_name||'Предмет')+'</b></div><div>'+src+'</div><div>'+(trade?'<a style="color:#c4b5fd" href="'+esc(trade)+'" target="_blank" rel="noopener noreferrer">Trade URL</a>':'<span class="bad">Нет Trade URL</span>')+'</div><div>'+fmt(o.created_at)+'</div><div>'+(pending?'<button onclick="markOrderSent(\\''+esc(o.id)+'\\')">Отправлено</button>':'<span class="pill good">Отправлено</span>')+'</div></div>'}).join(''):'Заказов пока нет'}\nasync function markOrderSent(id){if(!confirm('Отметить заказ как отправленный?'))return;let r=await fetch('/api/admin/orders/'+encodeURIComponent(id)+'/sent',{method:'POST'});let j=await r.json().catch(()=>({}));if(!r.ok){alert('Ошибка: '+(j.error||r.status));return}load()}\n`;
 body=body.replace('function renderUsers(){',render+'function renderUsers(){');
 body=body.replace('renderUsers()}catch(e)', 'renderUsers();renderOrders(s.orders||[])}catch(e)');
 return body;
}
