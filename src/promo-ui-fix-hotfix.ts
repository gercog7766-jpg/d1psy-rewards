import express from 'express';

export function installPromoUiFixHotfix(){
  const response:any=(express as any).response;
  const original=response.send;
  if(response.__promoUiFix)return;
  response.__promoUiFix=true;
  response.send=function(body:any){
    if(typeof body==='string'){
      if(body.includes('D1PSY REWARDS')&&!body.includes('promoUiFixMarker')) body=fixUser(body);
      if(body.includes('Розыгрыши')&&body.includes('Пользователи')&&!body.includes('promoAdminUiFixMarker')) body=fixAdmin(body);
    }
    return original.call(this,body);
  };
}
function fixUser(b:string){return b}
function fixAdmin(b:string){
  const js=`<div id="promoAdminUiFixMarker"></div><script>(function(){
function el(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function ensureExpiry(){var btn=el('paCreate');if(!btn||el('paExpires'))return;var i=document.createElement('input');i.id='paExpires';i.type='datetime-local';i.title='Действует до (необязательно)';i.style.minWidth='190px';btn.parentNode.insertBefore(i,btn)}
function sync(){var t=el('paType'),co=el('paCoins'),pr=el('paPrize');if(!t||!co||!pr)return;var skin=t.value==='prize';co.style.display=skin?'none':'';pr.style.display=skin?'':'none';co.placeholder='Количество монет'}
async function loadPrizes(){var pr=el('paPrize');if(!pr)return;try{var r=await fetch('/api/admin/promo-prizes',{cache:'no-store'}),j=await r.json();var a=j.prizes||[];pr.innerHTML=a.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+' ('+x.sell_price_coins+' Монет)</option>'}).join('')}catch(e){}}
async function cancelPromo(id,code){if(!confirm('Отменить промокод '+code+'?'))return;await fetch('/api/admin/promos/'+encodeURIComponent(id)+'/cancel',{method:'POST'});loadList()}
function fmtDate(v){if(!v)return '';var d=new Date(v);return isNaN(d.getTime())?'':d.toLocaleString('ru-RU')}
async function loadList(){try{var r=await fetch('/api/admin/promos',{cache:'no-store'}),j=await r.json();if(!r.ok)return;var box=el('paList'),now=Date.now();if(!box)return;box.innerHTML=(j.promos||[]).map(function(x){var limit=Number(x.activation_count)>=Number(x.max_activations),expired=!!x.expires_at&&new Date(x.expires_at).getTime()<=now,finished=limit||expired;var status=!x.active&&!finished?'<span style="color:#a99dbb">Отменён</span>':finished?'<span style="color:#fbbf24">Окончен</span>':'<span style="color:#86efac">Активен</span>';var reason=limit?' · лимит исчерпан':expired?' · время истекло':'';var until=x.expires_at?' · до '+fmtDate(x.expires_at):' · без срока';var btn=x.active&&!finished?' <button type="button" data-promo-cancel="'+x.id+'" data-promo-code="'+esc(x.code)+'" style="margin-left:8px;padding:5px 9px;border:1px solid #6b3345;background:#321723;color:#fda4af;border-radius:8px;cursor:pointer">Отменить</button>':'';return '<div style="padding:8px;border-top:1px solid #2c2039"><b>'+esc(x.code)+'</b> · '+(x.reward_type==='coins'?x.coin_amount+' Монет':'Скин')+' · '+x.activation_count+'/'+x.max_activations+' · '+status+reason+until+btn+'</div>'}).join('')||'Промокодов пока нет';box.querySelectorAll('[data-promo-cancel]').forEach(function(btn){btn.onclick=function(){cancelPromo(btn.getAttribute('data-promo-cancel'),btn.getAttribute('data-promo-code'))}})}catch(e){}}
async function create(){var t=el('paType'),msg=el('paMsg'),btn=el('paCreate'),ex=el('paExpires');if(!t||!btn)return;var expiresAt='';if(ex&&ex.value){var d=new Date(ex.value);if(isNaN(d.getTime())||d.getTime()<=Date.now()){msg.textContent='Время окончания должно быть в будущем';return}expiresAt=d.toISOString()}var body={code:el('paCode').value,maxActivations:el('paMax').value,rewardType:t.value,coinAmount:el('paCoins').value,prizeId:el('paPrize').value,expiresAt:expiresAt};msg.textContent='Создаём…';btn.disabled=true;try{var r=await fetch('/api/admin/promos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json().catch(function(){return{}});if(r.ok){msg.textContent='Промокод создан';el('paCode').value='';if(ex)ex.value='';await loadList()}else msg.textContent=j.error==='invalid_expiration'?'Укажи будущее время окончания':'Не удалось создать промокод: '+(j.error||r.status)}finally{btn.disabled=false}}
function init(){ensureExpiry();var t=el('paType'),btn=el('paCreate');if(!t||!btn)return;sync();t.addEventListener('change',sync);btn.onclick=create;loadPrizes();loadList()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();</script>`;
  b=b.replace('</body>',js+'</body>');return b;
}
