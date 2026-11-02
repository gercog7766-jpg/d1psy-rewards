import express from 'express';

const CSS=`<style id="upgraderMultiV1">
.selected.multiSel{height:260px;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px;align-content:center}.multiMini{min-width:0;border:1px solid #3d2a51;border-radius:11px;background:#120d19;padding:6px;text-align:center}.multiMini img{width:100%!important;height:72px!important;object-fit:contain}.multiMini b{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.multiTotal{grid-column:1/-1;color:#fcd34d;font-weight:950;font-size:14px}.item.multiOn{border-color:#8b5cf6!important;box-shadow:0 0 0 2px #8b5cf655!important}.multiCount{color:#c4b5fd;font-size:11px;margin-left:6px}
</style>`;

export function installUpgraderMultiHotfix(){
 const response:any=(express as any).response;if(response.__upgraderMultiV1)return;response.__upgraderMultiV1=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Апгрейдер — d1psy Rewards</title>')&&!body.includes('upgraderMultiV1')){
   body=body.replace('</head>',CSS+'</head>');
   body=body.replace('<h2>Твой предмет</h2>','<h2>Твои предметы <span id="srcCount" class="multiCount">0/4</span></h2>').replace('<div class="hint">Выбери один предмет из инвентаря</div>','<div class="hint">Выбери до 4 предметов — их стоимость суммируется</div>');
   body=body.replace('<h2>Желаемый предмет</h2>','<h2>Желаемые предметы <span id="tgtCount" class="multiCount">0/4</span></h2>').replace('<div class="hint">Выбери конкретный вариант из магазина</div>','<div class="hint">Выбери до 4 вариантов — их стоимость суммируется</div>');
  }
  if(typeof body==='string'&&body.includes("var data={inventory:[],targets:[]},s=null,t=null,busy=false")&&!body.includes('window.__upMulti')){
   body=body.replace("var data={inventory:[],targets:[]},s=null,t=null,busy=false;", "var data={inventory:[],targets:[]},s=null,t=null,busy=false;window.__upMulti={sources:[],targets:[]};");
   body=body.replace("function card(x,type){", `function multiSum(a){return a.reduce(function(n,x){return n+Number(x.value||0)},0)}function multiHas(a,id,key){return a.some(function(x){return String(x[key])===String(id)})}function multiSelected(el,a,isTarget){if(!el)return;el.classList.add('multiSel');if(!a.length){el.innerHTML='<span class="hint" style="grid-column:1/-1">Предметы не выбраны</span>';return}var total=multiSum(a);el.innerHTML=a.map(function(x){var suffix=isTarget&&x.wear?' · '+x.wear:'';return '<div class="multiMini"><img src="'+esc(x.imageUrl||'')+'"><b>'+esc(x.name+suffix)+'</b><span class="coins">'+Number(x.value)+' М</span></div>'}).join('')+'<div class="multiTotal">Итого: '+total+' Монет</div>'}function multiSync(){var S=window.__upMulti.sources,T=window.__upMulti.targets;s=S[0]||null;t=T[0]||null;multiSelected($('source'),S,false);multiSelected($('target'),T,true);if($('srcCount'))$('srcCount').textContent=S.length+'/4';if($('tgtCount'))$('tgtCount').textContent=T.length+'/4'}function card(x,type){`);
   body=body.replace("((type==='s'?s?.winId:t?.variantId)===id?'on':'')", "(multiHas(type==='s'?window.__upMulti.sources:window.__upMulti.targets,id,type==='s'?'winId':'variantId')?'on multiOn':'')");
   body=body.replace("data.inventory.filter(x=>x.name.toLowerCase().includes(a)).map", "data.inventory.filter(x=>x.name.toLowerCase().includes(a)).sort((x,y)=>Number(x.value)-Number(y.value)||x.name.localeCompare(y.name)).map");
   body=body.replace("data.targets.filter(x=>x.name.toLowerCase().includes(b)&&(!s||x.value>s.value)).map", "data.targets.filter(x=>x.name.toLowerCase().includes(b)).map");
   body=body.replace("document.querySelectorAll('[data-s]').forEach(e=>e.onclick=()=>{s=data.inventory.find(x=>x.winId===e.dataset.s);if(t&&t.value<=s.value)t=null;render();draw()});document.querySelectorAll('[data-t]').forEach(e=>e.onclick=()=>{t=data.targets.find(x=>x.variantId===e.dataset.t);render();draw()})", "document.querySelectorAll('[data-s]').forEach(e=>e.onclick=()=>{var x=data.inventory.find(x=>x.winId===e.dataset.s),a=window.__upMulti.sources,i=a.findIndex(y=>y.winId===x.winId);if(i>=0)a.splice(i,1);else if(a.length<4)a.push(x);else return alert('Можно выбрать максимум 4 предмета.');multiSync();render();draw()});document.querySelectorAll('[data-t]').forEach(e=>e.onclick=()=>{var x=data.targets.find(x=>x.variantId===e.dataset.t),a=window.__upMulti.targets,i=a.findIndex(y=>y.variantId===x.variantId);if(i>=0)a.splice(i,1);else if(a.length<4)a.push(x);else return alert('Можно выбрать максимум 4 предмета.');multiSync();render();draw()})");
   body=body.replace("function render(){sel($('source'),s,false);sel($('target'),t,true);var p=s&&t?Math.min(90,s.value/t.value*90):0;", "function render(){multiSync();var sv=multiSum(window.__upMulti.sources),tv=multiSum(window.__upMulti.targets);var p=sv&&tv?Math.min(90,sv/tv*90):0;");
   body=body.replace("$('go').disabled=!s||!t||t.value<=s.value||busy", "$('go').disabled=!window.__upMulti.sources.length||!window.__upMulti.targets.length||tv<=sv||busy");
   body=body.replace("data=await r.json();s=null;t=null;render();draw()", "data=await r.json();window.__upMulti.sources=[];window.__upMulti.targets=[];s=null;t=null;render();draw()");
   body=body.replace("if(!s||!t||busy)return;", "if(!window.__upMulti.sources.length||!window.__upMulti.targets.length||busy)return;");
   body=body.replace("body:JSON.stringify({sourceWinId:s.winId,targetShopItemId:t.itemId,targetVariantId:t.variantId", "body:JSON.stringify({sourceWinIds:window.__upMulti.sources.map(x=>x.winId),targets:window.__upMulti.targets.map(x=>({itemId:x.itemId,variantId:x.variantId})),sourceWinId:s&&s.winId,targetShopItemId:t&&t.itemId,targetVariantId:t&&t.variantId");
  }
  if(typeof body==='string'&&body.includes("var ex=Math.max(0,Number(window.upExtraCoins||0)),p=s&&t?")&&!body.includes('multiSum(window.__upMulti.sources)')){
   body=body.replace("var ex=Math.max(0,Number(window.upExtraCoins||0)),p=s&&t?Math.min(85,(s.value+ex)/t.value*90):0;", "var ex=Math.max(0,Number(window.upExtraCoins||0)),sv=multiSum(window.__upMulti.sources),tv=multiSum(window.__upMulti.targets),p=sv&&tv?Math.min(85,(sv+ex)/tv*90):0;");
   body=body.replace("var mx=s&&t?Math.max(0,Math.min(Number(window.upBalance||0),Math.ceil(t.value*85/90-s.value))):0;", "var mx=sv&&tv?Math.max(0,Math.min(Number(window.upBalance||0),Math.ceil(tv*85/90-sv))):0;");
  }
  return original.call(this,body);
 };
}
