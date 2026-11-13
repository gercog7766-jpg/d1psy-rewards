import express from 'express';

export function installAdminGrantsLoaderHotfix(){
 const proto:any=(express as any).application, originalGet=proto.get;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/admin') handlers=handlers.map((handler:any)=>function(req:any,res:any,next:any){
   const send=res.send.bind(res);
   res.send=(body:any)=>send(typeof body==='string'?inject(body):body);
   return handler(req,res,next);
  });
  return originalGet.call(this,path,...handlers);
 };
}

function inject(body:string){
 if(body.includes('adminGrantOptionsLoader'))return body;
 const script=`<script id="adminGrantOptionsLoader">(function(){
 async function loadGrantOptions(){
  var su=document.getElementById('grantSkinUser'),cu=document.getElementById('grantCoinUser'),pr=document.getElementById('grantPrize');
  if(!su||!cu||!pr)return;
  try{
   var r=await fetch('/api/admin/grants/options',{cache:'no-store'});
   if(!r.ok)throw new Error(String(r.status));
   var j=await r.json(),users=Array.isArray(j.users)?j.users:[],prizes=Array.isArray(j.prizes)?j.prizes:[];
   function fill(select,items,label){var old=select.value;select.innerHTML='';items.forEach(function(x){var o=document.createElement('option');o.value=x.id;o.textContent=label(x);select.appendChild(o)});if(old&&Array.prototype.some.call(select.options,function(o){return o.value===old}))select.value=old}
   fill(su,users,function(u){return (u.twitch_display_name||u.twitch_login||'Пользователь')+' (@'+(u.twitch_login||'—')+')'});
   fill(cu,users,function(u){return (u.twitch_display_name||u.twitch_login||'Пользователь')+' (@'+(u.twitch_login||'—')+')'});
   fill(pr,prizes,function(p){return (p.name||'Скин')+(p.sell_price_coins!=null?' · '+p.sell_price_coins+' Монет':'')});
  }catch(e){console.error('admin grants options load failed',e)}
 }
 async function doGrant(kind){
  var su=document.getElementById('grantSkinUser'),cu=document.getElementById('grantCoinUser'),pr=document.getElementById('grantPrize'),amountEl=document.getElementById('grantCoins'),msg=document.getElementById('grantMsg');
  if(!su||!cu||!pr||!amountEl)return;
  var body=kind==='skin'?{userId:su.value,prizeId:pr.value}:{userId:cu.value,amount:Number(amountEl.value)};
  if(!body.userId||(kind==='skin'&&!body.prizeId)||(kind==='coins'&&(!Number.isSafeInteger(body.amount)||body.amount===0))){if(msg)msg.textContent='Выберите пользователя и проверьте данные.';return}
  if(!await window.dropsoConfirm(kind==='skin'?'Начислить выбранный скин пользователю?':(body.amount<0?'Списать '+Math.abs(body.amount)+' Монет у пользователя?':'Начислить '+body.amount+' Монет пользователю?')))return;
  var btn=document.getElementById(kind==='skin'?'grantSkin':'grantCoin');if(btn)btn.disabled=true;
  try{var r=await fetch('/api/admin/grants/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await r.json().catch(function(){return {}});if(msg)msg.textContent=r.ok?(kind==='coins'&&body.amount<0?'Готово. Монеты списаны.':'Готово. Начисление выполнено.'):'Ошибка: '+(j.error||r.status);if(r.ok)await loadGrantOptions()}catch(e){if(msg)msg.textContent='Ошибка сети'}finally{if(btn)btn.disabled=false}
 }
 function bind(){var skin=document.getElementById('grantSkin'),coin=document.getElementById('grantCoin');if(skin&&!skin.dataset.grantBound){skin.dataset.grantBound='1';skin.addEventListener('click',function(){doGrant('skin')})}if(coin&&!coin.dataset.grantBound){coin.dataset.grantBound='1';coin.addEventListener('click',function(){doGrant('coins')})}}
 function init(){loadGrantOptions();bind()}
 document.addEventListener('DOMContentLoaded',init);
 setTimeout(init,300);
 document.addEventListener('click',function(e){var t=e.target;if(t&&t.matches&&t.matches('[data-page="grants"]'))setTimeout(init,0)});
})();</script>`;
 return body.replace('</body>',script+'</body>');
}
