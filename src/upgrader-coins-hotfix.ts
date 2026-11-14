import express from 'express';

const STYLE=`<style id="upgraderCoinsV2">
.up-coins{margin-top:12px;padding:11px 12px;border:1px solid #3d2a51;border-radius:12px;background:#100b17;display:none}.up-coins.on{display:block}.up-coins-head{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:800;margin-bottom:8px}.up-coins-head span:last-child{color:#fcd34d}.up-coins input{width:100%;accent-color:#7c3aed;cursor:pointer}.up-coins-foot{display:flex;justify-content:space-between;color:#95899f;font-size:11px;margin-top:5px}
.up-coins-retry{margin-top:8px;border:1px solid #7750a0;border-radius:8px;background:#29163f;color:#fff;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px}.up-coins-retry[hidden]{display:none!important}
</style>`;

export function installUpgraderCoinsHotfix(){
 const response:any=(express as any).response;if(response.__upgraderCoinsV2)return;response.__upgraderCoinsV2=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Апгрейдер — d1psy Rewards</title>')&&!body.includes('upgraderCoinsV2')){
   body=body.replace('</head>',STYLE+'</head>');
   body=body.replace('<div id="source" class="selected skin-selection"><span class="hint">Предмет не выбран</span></div>','<div id="source" class="selected skin-selection"><span class="hint">Предмет не выбран</span></div><div id="coinBoost" class="up-coins"><div class="up-coins-head"><span>Добавить монеты к шансу</span><span id="coinBoostValue">0 Монет</span></div><input id="coinBoostRange" aria-label="Добавить монеты к шансу" type="range" min="0" max="0" value="0" step="1"><div class="up-coins-foot"><span id="coinBalance">Баланс: —</span><span>Макс. шанс 85%</span></div><button id="coinBalanceRetry" class="up-coins-retry" type="button" hidden>Повторить загрузку баланса</button></div>');
  }
  if(typeof body==='string'&&body.includes("fetch('/api/me/upgrader/run'")){
   body=body.replace("p=sv&&tv?Math.min(90,sv/tv*90):0;", "p=0;var ex=Math.max(0,Math.floor(Number(window.upExtraCoins||0))),known=Number.isSafeInteger(window.upBalance);var cb=$('coinBoost'),cr=$('coinBoostRange');if(cb)cb.classList.toggle('on',!!sv);if(cr){var mx=sv&&tv&&known?Math.max(0,Math.min(window.upBalance,Math.ceil(tv*85/90-sv))):0;ex=Math.min(ex,mx);window.upExtraCoins=ex;cr.max=String(mx);cr.value=String(ex);cr.disabled=busy||!known||!sv||!tv||mx===0;$('coinBoostValue').textContent=ex+' Монет';$('coinBalance').textContent=known?'Баланс: '+window.upBalance+' Монет':upBalanceLoading?'Загружаем баланс…':'Баланс недоступен';$('coinBalanceRetry').hidden=known||upBalanceLoading}p=sv&&tv?Math.min(85,(sv+ex)/tv*90):0;");
   body=body.replace("({itemId:x.itemId,variantId:x.variantId}))", "({itemId:x.itemId,variantId:x.variantId})),extraCoins:Math.max(0,Math.floor(Number(window.upExtraCoins||0)))");
   body=body.replace("async function load(){", "var upBalanceLoading=false,upBalanceVersion=0;window.upBalance=null;async function refreshUpBalance(){var version=++upBalanceVersion;upBalanceLoading=true;window.upBalance=null;render();try{var br=await fetch('/api/me/upgrader/balance',{cache:'no-store'});if(!br.ok)throw Error('balance_load_failed');var bj=await br.json();if(!Number.isSafeInteger(bj.balance))throw Error('invalid_balance');if(version===upBalanceVersion)window.upBalance=bj.balance}catch(e){if(version===upBalanceVersion)window.upBalance=null}finally{if(version===upBalanceVersion){upBalanceLoading=false;render()}}}async function load(){");
   body=body.replace("sources.length=0;targets.length=0;render();draw()}$('qs')", "window.upExtraCoins=0;sources.length=0;targets.length=0;await refreshUpBalance();render();draw()}$('qs')");
   // Catalog rewrites the handler section; anchor the load tail independently.
   body=body.replace("sources.length=0;targets.length=0;render();draw()}function quickTarget", "window.upExtraCoins=0;sources.length=0;targets.length=0;await refreshUpBalance();render();draw()}function quickTarget");
   body=body.replace("$('resultClose').onclick=", "$('coinBalanceRetry').onclick=()=>refreshUpBalance();$('resultClose').onclick=");
   body=body.replace("$('qs').oninput=draw;$('qt').oninput=draw;", "$('qs').oninput=draw;$('qt').oninput=draw;var cbr=$('coinBoostRange');if(cbr)cbr.oninput=()=>{window.upExtraCoins=Math.max(0,Math.floor(Number(cbr.value)||0));render()};");
  }
  return original.call(this,body);
 };
}
