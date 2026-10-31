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

function fixUser(b:string){
  const button='<button id="promoOpenFix" type="button" style="border:1px solid #49315f;background:#171020;color:#fff;border-radius:10px;padding:9px 13px;font-weight:700;cursor:pointer">Промокод</button>';
  const modal='<div id="promoUiFixMarker"></div><div id="promoModalFix" style="display:none;position:fixed;inset:0;background:#000b;z-index:10050;align-items:center;justify-content:center;padding:16px"><div style="width:min(420px,100%);background:#15101e;border:1px solid #4b2c68;border-radius:16px;padding:20px;box-shadow:0 20px 60px #0008"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><b style="font-size:18px">Активация промокода</b><button id="promoCloseFix" type="button" style="background:transparent;border:0;color:#aaa;font-size:24px;cursor:pointer">×</button></div><div class="muted" style="margin:7px 0 14px">Введите промокод, чтобы получить награду.</div><input id="promoInputFix" maxlength="64" autocomplete="off" placeholder="Промокод" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;background:#0d0912;color:#fff;border:1px solid #3b2853;outline:none"><div id="promoMsgFix" class="muted" style="min-height:20px;margin:10px 0"></div><button id="promoRedeemFix" type="button" style="width:100%;padding:11px;border:1px solid #7c3aed;background:#6d28d9;color:#fff;border-radius:10px;font-weight:800;cursor:pointer">Активировать</button></div></div>';
  if(!b.includes('promoOpenFix')){
    if(b.includes('>Магазин</a>')) b=b.replace('>Магазин</a>','>Магазин</a>'+button);
    else if(b.includes('Магазин')) b=b.replace(/(<a[^>]*>Магазин<\/a>)/,'$1'+button);
  }
  b=b.replace('</body>',modal+'<script>(function(){var o=document.getElementById("promoOpenFix"),m=document.getElementById("promoModalFix"),c=document.getElementById("promoCloseFix"),r=document.getElementById("promoRedeemFix"),i=document.getElementById("promoInputFix"),x=document.getElementById("promoMsgFix");if(!o||!m)return;o.onclick=function(){m.style.display="flex";setTimeout(function(){i&&i.focus()},0)};c.onclick=function(){m.style.display="none"};m.onclick=function(e){if(e.target===m)m.style.display="none"};if(i)i.onkeydown=function(e){if(e.key==="Enter")r.click()};r.onclick=async function(){var code=(i.value||"").trim();if(!code){x.textContent="Введите промокод";return}r.disabled=true;r.textContent="Проверяем…";x.textContent="";try{var q=await fetch("/api/me/promo/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code})});var j=await q.json().catch(function(){return{}});if(q.ok){x.textContent=j.rewardType==="coins"?"Начислено: +"+j.amount+" Монет":"Скин добавлен в инвентарь";r.textContent="Активировано";setTimeout(function(){location.reload()},900);return}x.textContent=j.error==="already_used"?"Этот промокод вы уже активировали":j.error==="limit_reached"?"Лимит активаций исчерпан":j.error==="promo_not_found"?"Промокод не найден":"Не удалось активировать промокод"}catch(e){x.textContent="Ошибка соединения"}r.disabled=false;r.textContent="Активировать"}})();</script></body>');
  return b;
}

function fixAdmin(b:string){
  const js=`<div id="promoAdminUiFixMarker"></div><script>(function(){
function el(id){return document.getElementById(id)}
function sync(){var t=el('paType'),co=el('paCoins'),pr=el('paPrize');if(!t||!co||!pr)return;var skin=t.value==='prize';co.style.display=skin?'none':'';pr.style.display=skin?'':'none';co.placeholder='Количество монет'}
async function loadPrizes(){var pr=el('paPrize');if(!pr)return;pr.innerHTML='<option value="">Загрузка скинов…</option>';try{var r=await fetch('/api/admin/promo-prizes',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||String(r.status));var a=j.prizes||[];pr.innerHTML=a.length?a.map(function(x){return '<option value="'+x.id+'">'+x.name+' ('+x.sell_price_coins+' Монет)</option>'}).join(''):'<option value="">Нет доступных скинов</option>'}catch(e){pr.innerHTML='<option value="">Ошибка загрузки скинов</option>';var m=el('paMsg');if(m)m.textContent='Не удалось загрузить скины'} }
async function cancelPromo(id,code){if(!confirm('Отменить промокод '+code+'? После отмены его нельзя будет активировать. Уже выданные награды останутся у пользователей.'))return;var msg=el('paMsg');msg.textContent='Отменяем…';try{var r=await fetch('/api/admin/promos/'+encodeURIComponent(id)+'/cancel',{method:'POST'}),j=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(j.error||String(r.status));msg.textContent='Промокод '+code+' отменён';await loadList()}catch(e){msg.textContent='Не удалось отменить промокод'}}
async function loadList(){try{var r=await fetch('/api/admin/promos',{cache:'no-store'}),j=await r.json();if(!r.ok)return;var box=el('paList');if(box)box.innerHTML=(j.promos||[]).map(function(x){var status=x.active?'<span style="color:#86efac">Активен</span>':'<span style="color:#a99dbb">Отменён</span>';var btn=x.active?' <button type="button" data-promo-cancel="'+x.id+'" data-promo-code="'+String(x.code).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'" style="margin-left:8px;padding:5px 9px;border:1px solid #6b3345;background:#321723;color:#fda4af;border-radius:8px;cursor:pointer">Отменить</button>':'';return '<div style="padding:8px;border-top:1px solid #2c2039"><b>'+x.code+'</b> · '+(x.reward_type==='coins'?x.coin_amount+' Монет':'Скин')+' · '+x.activation_count+'/'+x.max_activations+' · '+status+btn+'</div>'}).join('')||'Промокодов пока нет';box.querySelectorAll('[data-promo-cancel]').forEach(function(btn){btn.onclick=function(){cancelPromo(btn.getAttribute('data-promo-cancel'),btn.getAttribute('data-promo-code'))}})}catch(e){}}
async function create(){var t=el('paType'),msg=el('paMsg'),btn=el('paCreate');if(!t||!btn)return;var body={code:(el('paCode')||{}).value||'',maxActivations:(el('paMax')||{}).value||'',rewardType:t.value,coinAmount:(el('paCoins')||{}).value||'',prizeId:(el('paPrize')||{}).value||''};msg.textContent='Создаём…';btn.disabled=true;try{var r=await fetch('/api/admin/promos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),j=await r.json().catch(function(){return{}});if(r.ok){msg.textContent='Промокод создан';el('paCode').value='';await loadList()}else{msg.textContent=j.error==='code_exists'?'Такой промокод уже существует':j.error==='invalid_coins'?'Укажи количество монет':j.error==='invalid_prize'?'Выбери скин':'Проверь код и количество активаций'}}catch(e){msg.textContent='Ошибка соединения'}finally{btn.disabled=false}}
function init(){var t=el('paType'),btn=el('paCreate');if(!t||!btn)return;sync();t.addEventListener('change',sync);btn.onclick=create;loadPrizes();loadList()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();</script>`;
  b=b.replace('</body>',js+'</body>');
  return b;
}
