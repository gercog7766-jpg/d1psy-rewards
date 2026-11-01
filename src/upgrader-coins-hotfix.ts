import express from 'express';

const STYLE=`<style id="upgraderCoinsV1">
.up-coins{margin-top:12px;padding:11px 12px;border:1px solid #3d2a51;border-radius:12px;background:#100b17;display:none}.up-coins.on{display:block}.up-coins-head{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:800;margin-bottom:8px}.up-coins-head span:last-child{color:#fcd34d}.up-coins input{width:100%;accent-color:#7c3aed;cursor:pointer}.up-coins-foot{display:flex;justify-content:space-between;color:#95899f;font-size:11px;margin-top:5px}
</style>`;

export function installUpgraderCoinsHotfix(){
 const response:any=(express as any).response;if(response.__upgraderCoinsV1)return;response.__upgraderCoinsV1=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Апгрейдер — d1psy Rewards</title>')&&!body.includes('upgraderCoinsV1')){
   body=body.replace('</head>',STYLE+'</head>');
   body=body.replace('<div id="source" class="selected"><span class="hint">Предмет не выбран</span></div>','<div id="source" class="selected"><span class="hint">Предмет не выбран</span></div><div id="coinBoost" class="up-coins"><div class="up-coins-head"><span>Добавить монеты к шансу</span><span id="coinBoostValue">0 Монет</span></div><input id="coinBoostRange" type="range" min="0" max="0" value="0" step="1"><div class="up-coins-foot"><span id="coinBalance">Баланс: —</span><span>Макс. шанс 85%</span></div></div>');
  }
  if(typeof body==='string'&&body.includes("fetch('/api/me/upgrader/run'")){
   body=body.replace("var p=s&&t?Math.min(90,s.value/t.value*90):0;", "var ex=Math.max(0,Number(window.upExtraCoins||0)),p=s&&t?Math.min(85,(s.value+ex)/t.value*90):0;var cb=$('coinBoost'),cr=$('coinBoostRange');if(cb)cb.classList.toggle('on',!!s);if(cr){var mx=s&&t?Math.max(0,Math.min(Number(window.upBalance||0),Math.ceil(t.value*85/90-s.value))):0;cr.max=String(mx);if(ex>mx){ex=mx;window.upExtraCoins=mx;cr.value=String(mx)}$('coinBoostValue').textContent=ex+' Монет';$('coinBalance').textContent='Баланс: '+Number(window.upBalance||0)+' Монет'}");
   body=body.replace("data=await r.json();s=null;t=null;render();draw()", "data=await r.json();try{var br=await fetch('/api/me/upgrader/balance',{cache:'no-store'}),bj=await br.json();window.upBalance=Math.max(0,Number(bj.balance||0))}catch{}window.upExtraCoins=0;s=null;t=null;render();draw()");
   body=body.replace("targetVariantId:t.variantId", "targetVariantId:t.variantId,extraCoins:Math.max(0,Math.floor(Number(window.upExtraCoins||0)))");
   body=body.replace("$('qs').oninput=draw;$('qt').oninput=draw;", "$('qs').oninput=draw;$('qt').oninput=draw;var cbr=$('coinBoostRange');if(cbr)cbr.oninput=()=>{window.upExtraCoins=Math.max(0,Math.floor(Number(cbr.value)||0));render()};");
  }
  return original.call(this,body);
 };
}
