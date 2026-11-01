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
   function fill(select,items,label){select.innerHTML='';items.forEach(function(x){var o=document.createElement('option');o.value=x.id;o.textContent=label(x);select.appendChild(o)})}
   fill(su,users,function(u){return (u.twitch_display_name||u.twitch_login||'Пользователь')+' (@'+(u.twitch_login||'—')+')'});
   fill(cu,users,function(u){return (u.twitch_display_name||u.twitch_login||'Пользователь')+' (@'+(u.twitch_login||'—')+')'});
   fill(pr,prizes,function(p){return (p.name||'Скин')+(p.sell_price_coins!=null?' · '+p.sell_price_coins+' Монет':'')});
  }catch(e){console.error('admin grants options load failed',e)}
 }
 document.addEventListener('DOMContentLoaded',loadGrantOptions);
 setTimeout(loadGrantOptions,300);
 document.addEventListener('click',function(e){var t=e.target;if(t&&t.matches&&t.matches('[data-page="grants"]'))loadGrantOptions()});
})();</script>`;
 return body.replace('</body>',script+'</body>');
}
