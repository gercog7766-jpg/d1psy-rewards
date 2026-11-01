import express from 'express';

const STYLE=`<style id="upgraderCatalogV3">
.up-filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 12px}.up-filters button,.up-filters input,.up-filters select{height:32px;border:1px solid #3b2950;background:#0b0810;color:#ddd;border-radius:9px;padding:0 10px;font:700 12px system-ui}.up-filters button{cursor:pointer}.up-filters button.on{background:#6d28d9;border-color:#8b5cf6;color:#fff}.up-filters input{width:88px;outline:none}.up-filters select{outline:none}.up-filters .up-label{font-size:11px;color:#91869d;margin-right:1px}.wheel:after{display:block!important;content:''!important;position:absolute!important;inset:8px!important;border-radius:50%!important;border:0!important;background:conic-gradient(from 0deg,#7c3aed 0 var(--p,0%),#2b1c39 var(--p,0%) 100%)!important;z-index:0!important;box-shadow:0 0 18px #7c3aed22}.wheel{padding:0!important;background:#171020!important}.wheel:before{inset:20px!important;z-index:1!important;background:#120d19!important;border:1px solid #4a3262!important}.chance{z-index:3!important}
</style>`;

export function installUpgraderCatalogV3Hotfix(){
 const response:any=(express as any).response;if(response.__upgraderCatalogV3)return;response.__upgraderCatalogV3=true;const original=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('<title>Апгрейдер — d1psy Rewards</title>')&&!body.includes('upgraderCatalogV3')){
   body=body.replace('</head>',STYLE+'</head>');
   body=body.replace('<div id="targets" class="grid"></div>','<div class="up-filters"><span class="up-label">Цена:</span><button type="button" data-mul="2">×2</button><button type="button" data-mul="3">×3</button><button type="button" data-mul="5">×5</button><input id="pmin" inputmode="numeric" placeholder="от"><input id="pmax" inputmode="numeric" placeholder="до"><select id="sortT"><option value="asc">Сначала дешевые</option><option value="desc">Сначала дорогие</option></select></div><div id="targets" class="grid"></div>');
  }
  if(typeof body==='string'&&body.includes("var data={inventory:[],targets:[]}")){
   body=body.replace("var data={inventory:[],targets:[]},s=null,t=null,busy=false;", "var data={inventory:[],targets:[]},s=null,t=null,busy=false,mul=0;");
   const oldDraw="function draw(){var a=$('qs').value.toLowerCase(),b=$('qt').value.toLowerCase();$('inv').innerHTML=data.inventory.filter(x=>x.name.toLowerCase().includes(a)).map(x=>card(x,'s')).join('')||'<div class=\"hint\">Нет доступных предметов</div>';$('targets').innerHTML=data.targets.filter(x=>x.name.toLowerCase().includes(b)&&(!s||x.value>s.value)).map(x=>card(x,'t')).join('')||'<div class=\"hint\">Нет подходящих предметов</div>';";
   const newDraw="function draw(){var a=$('qs').value.toLowerCase(),b=$('qt').value.toLowerCase();$('inv').innerHTML=data.inventory.filter(x=>x.name.toLowerCase().includes(a)).map(x=>card(x,'s')).join('')||'<div class=\"hint\">Нет доступных предметов</div>';var lo=Number($('pmin')?.value||0),hi=Number($('pmax')?.value||0),arr=data.targets.filter(x=>x.name.toLowerCase().includes(b)&&(!s||x.value>s.value));if(s&&mul)arr=arr.filter(x=>x.value>=s.value*mul&&x.value<s.value*(mul+1));if(lo)arr=arr.filter(x=>x.value>=lo);if(hi)arr=arr.filter(x=>x.value<=hi);arr.sort((x,y)=>$('sortT')?.value==='desc'?y.value-x.value:x.value-y.value);var seen=new Set();arr=arr.filter(x=>{if(seen.has(x.itemId))return false;seen.add(x.itemId);return true});$('targets').innerHTML=arr.map(x=>card(x,'t')).join('')||'<div class=\"hint\">Нет подходящих предметов</div>';";
   body=body.replace(oldDraw,newDraw);
   body=body.replace("$('qs').oninput=draw;$('qt').oninput=draw;", "$('qs').oninput=draw;$('qt').oninput=draw;if($('pmin'))$('pmin').oninput=draw;if($('pmax'))$('pmax').oninput=draw;if($('sortT'))$('sortT').onchange=draw;document.querySelectorAll('[data-mul]').forEach(e=>e.onclick=()=>{var n=Number(e.dataset.mul);mul=mul===n?0:n;document.querySelectorAll('[data-mul]').forEach(z=>z.classList.toggle('on',Number(z.dataset.mul)===mul));draw()});");
  }
  return original.call(this,body);
 };
}
