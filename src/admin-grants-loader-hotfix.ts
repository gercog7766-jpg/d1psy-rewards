import express from 'express';
export function installAdminGrantsLoaderHotfix(){
 const proto:any=express.application,original=proto.get;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/admin')handlers=handlers.map(h=>function(req:any,res:any,next:any){const send=res.send.bind(res);res.send=(b:any)=>send(typeof b==='string'?inject(b):b);return h(req,res,next)});
  return original.call(this,path,...handlers);
 };
}
export function inject(body:string){
 if(body.includes('adminGrantOptionsLoader'))return body;
 return body.replace('</body>',`<script id="adminGrantOptionsLoader">(function(){
 const $=id=>document.getElementById(id),msg=$('grantMsg');
 if(!msg)return;
 function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o)}
 function clear(select,label){select.replaceChildren();option(select,'',label)}
 function search(inputId,selectId,shop){
  const input=$(inputId),select=$(selectId);let seq=0,timer,page=0;
  async function run(p){
   const token=++seq,q=input.value.trim();page=p;
   clear(select,'Поиск…');if(shop){$('grantPrev').hidden=true;$('grantNext').hidden=true}
   if(q.length<(shop?2:1)){clear(select,'Введите '+(shop?'название':'ник'));return}
   try{
    const r=await fetch('/api/admin/grants/'+(shop?'shop':'users')+'?q='+encodeURIComponent(q)+(shop?'&page='+p:''),{cache:'no-store'});
    if(!r.ok)throw Error(r.status);const j=await r.json();if(token!==seq)return;
    const items=shop?j.items:j.users;clear(select,items.length?'Выберите из результатов':'Нет совпадений');
    items.forEach(x=>option(select,shop?x.itemId+':'+(x.variantId||''):x.id,shop?[x.name,x.wear,x.kind==='normal'||!x.kind?'':x.kind,x.price+' монет'].filter(Boolean).join(' · '):(x.twitch_display_name||x.twitch_login)+' (@'+x.twitch_login+')'));
    if(shop){$('grantPrev').hidden=p===0;$('grantNext').hidden=!j.hasMore}
   }catch(e){if(token===seq)clear(select,'Ошибка поиска. Повторите ввод.')}
  }
  input.addEventListener('input',()=>{++seq;clearTimeout(timer);clear(select,'Поиск…');if(shop){$('grantPrev').hidden=true;$('grantNext').hidden=true}timer=setTimeout(()=>run(0),250)});
  if(shop){$('grantPrev').onclick=()=>run(Math.max(0,page-1));$('grantNext').onclick=()=>run(page+1)}
 }
 search('grantSkinSearch','grantSkinUser',false);search('grantCoinSearch','grantCoinUser',false);search('grantPrizeSearch','grantPrize',true);
 let pending=null;
 async function grant(kind){
  const skin=kind==='skin',btn=$(skin?'grantSkin':'grantCoin'),user=$(skin?'grantSkinUser':'grantCoinUser'),pr=$('grantPrize'),amount=Number($('grantCoins').value);
  if(btn.disabled)return;
  if(!user.value||(skin?!pr.value:!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>100000)){msg.textContent='Выберите пользователя и проверьте данные.';return}
  const [itemId,variantId]=pr.value.split(':'),data=skin?{userId:user.value,itemId,variantId:variantId||null}:{userId:user.value,amount};
  const label=user.selectedOptions[0].textContent,description=skin?pr.selectedOptions[0].textContent:(amount<0?'Списать ':'Начислить ')+Math.abs(amount)+' монет';
  btn.disabled=true;
  try{
   if(!await window.dropsoConfirm(description+' — '+label+'?'))return;
   if(skin){const key=JSON.stringify(data);if(!pending||pending.key!==key)pending={key,id:crypto.randomUUID()};data.requestId=pending.id}
   const r=await fetch('/api/admin/grants/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),j=await r.json().catch(()=>({}));
   if(r.ok){if(skin)pending=null;msg.textContent='Готово. Начисление выполнено.'}
   else{msg.textContent='Ошибка: '+(j.error||r.status)}
  }catch(e){msg.textContent='Ошибка сети. Проверьте результат перед повтором.'}finally{btn.disabled=false}
 }
 $('grantSkin').onclick=()=>grant('skin');$('grantCoin').onclick=()=>grant('coins');
})();</script></body>`);
}
