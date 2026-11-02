import express from 'express';

const FIX=String.raw`
/* upgraderRuntimeFixV1 */
(function(){
 if(!window.__upMulti)return;
 function sum(a){return (a||[]).reduce(function(n,x){return n+Number(x.value||0)},0)}
 function has(a,id,key){return (a||[]).some(function(x){return String(x[key])===String(id)})}
 function bindCards(){
  document.querySelectorAll('[data-s]').forEach(function(e){e.onclick=function(){var x=data.inventory.find(function(z){return String(z.winId)===String(e.dataset.s)});if(!x)return;var a=window.__upMulti.sources,i=a.findIndex(function(z){return String(z.winId)===String(x.winId)});if(i>=0)a.splice(i,1);else if(a.length<4)a.push(x);else return alert('Можно выбрать максимум 4 предмета.');multiSync();render();draw()}});
  document.querySelectorAll('[data-t]').forEach(function(e){e.onclick=function(){var x=data.targets.find(function(z){return String(z.variantId)===String(e.dataset.t)});if(!x)return;var a=window.__upMulti.targets,i=a.findIndex(function(z){return String(z.variantId)===String(x.variantId)});if(i>=0)a.splice(i,1);else if(a.length<4)a.push(x);else return alert('Можно выбрать максимум 4 предмета.');multiSync();render();draw()}})
 }
 draw=function(){
  var a=$('qs').value.toLowerCase(),b=$('qt').value.toLowerCase(),sv=sum(window.__upMulti.sources);
  $('inv').innerHTML=data.inventory.filter(function(x){return x.name.toLowerCase().includes(a)}).sort(function(x,y){return Number(x.value)-Number(y.value)||x.name.localeCompare(y.name,'ru')}).map(function(x){return card(x,'s')}).join('')||'<div class="hint">Нет доступных предметов</div>';
  var lo=Number($('pmin')&&$('pmin').value||0),hi=Number($('pmax')&&$('pmax').value||0),arr=data.targets.filter(function(x){return x.name.toLowerCase().includes(b)});
  if(sv&&typeof mul!=='undefined'&&mul)arr=arr.filter(function(x){return x.value>=sv*mul&&x.value<sv*(mul+1)});
  if(lo)arr=arr.filter(function(x){return x.value>=lo});if(hi)arr=arr.filter(function(x){return x.value<=hi});
  arr.sort(function(x,y){return $('sortT')&&$('sortT').value==='desc'?y.value-x.value:x.value-y.value});var seen=new Set();arr=arr.filter(function(x){if(seen.has(x.itemId))return false;seen.add(x.itemId);return true});
  $('targets').innerHTML=arr.map(function(x){return card(x,'t')}).join('')||'<div class="hint">Нет подходящих предметов</div>';bindCards()
 };
 render=function(){
  multiSync();var sv=sum(window.__upMulti.sources),tv=sum(window.__upMulti.targets),ex=Math.max(0,Number(window.upExtraCoins||0)),p=sv&&tv?Math.min(85,(sv+ex)/tv*90):0;
  $('pct').textContent=p?p.toFixed(1)+'%':'—';$('wheel').style.setProperty('--p',p+'%');$('go').disabled=!window.__upMulti.sources.length||!window.__upMulti.targets.length||tv<=sv||busy;
  var cb=$('coinBoost'),cr=$('coinBoostRange');if(cb)cb.classList.toggle('on',!!sv);if(cr){var mx=sv&&tv?Math.max(0,Math.min(Number(window.upBalance||0),Math.ceil(tv*85/90-sv))):0;cr.max=String(mx);if(ex>mx){ex=mx;window.upExtraCoins=mx;cr.value=String(mx)}if($('coinBoostValue'))$('coinBoostValue').textContent=ex+' Монет';if($('coinBalance'))$('coinBalance').textContent='Баланс: '+Number(window.upBalance||0)+' Монет'}
 };
 if(typeof quickTarget==='function')quickTarget=function(mode,n){var sv=sum(window.__upMulti.sources);if(!sv)return;if((mode==='mul'&&mul===n)||(mode==='pct'&&pct===n)){mul=0;pct=0;window.__upMulti.targets=[];multiSync();presetRender();render();draw();return}var a;if(mode==='mul'){mul=n;pct=0;var lo=sv*n,hi=sv*(n+1);a=data.targets.filter(function(x){return x.value>=lo&&x.value<hi}).sort(function(x,y){return x.value-y.value})}else{pct=n;mul=0;var wanted=sv*90/n;a=data.targets.slice().sort(function(x,y){return Math.abs(x.value-wanted)-Math.abs(y.value-wanted)})}var seen=new Set();a=a.filter(function(x){if(seen.has(x.itemId))return false;seen.add(x.itemId);return true});window.__upMulti.targets=a.length?[a[0]]:[];multiSync();presetRender();render();draw()};
 var cr=$('coinBoostRange');if(cr)cr.oninput=function(){window.upExtraCoins=Math.max(0,Math.floor(Number(cr.value)||0));render()};
 var oldLoad=load;load=async function(){await oldLoad();try{var br=await fetch('/api/me/upgrader/balance',{cache:'no-store'}),bj=await br.json();window.upBalance=Math.max(0,Number(bj.balance||0))}catch(e){window.upBalance=0}window.upExtraCoins=0;if(cr)cr.value='0';render();draw()};
})();
`;

export function installUpgraderRuntimeFixHotfix(){
 const response:any=(express as any).response;if(response.__upgraderRuntimeFixV1)return;response.__upgraderRuntimeFixV1=true;const original=response.send;
 response.send=function(body:any){
  const out=original.call(this,body);
  return out;
 };
 const downstream=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('window.__upMulti')&&body.includes("fetch('/api/me/upgrader/run'")&&!body.includes('upgraderRuntimeFixV1')){
   const marker='load()})();';
   if(body.includes(marker))body=body.replace(marker,FIX+'\nload()})();');
  }
  return downstream.call(this,body);
 };
}
