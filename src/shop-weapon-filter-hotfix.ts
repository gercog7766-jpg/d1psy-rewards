import express from 'express';

const BAR=`<div id="weaponFilters" class="wfbar">
<details class="wf"><summary>🔪 Нож</summary><div class="wfmenu" data-wfcat="knife"></div></details>
<details class="wf"><summary>🔫 Пистолет</summary><div class="wfmenu" data-wfcat="pistol"></div></details>
<details class="wf"><summary>🗡 Винтовка</summary><div class="wfmenu" data-wfcat="rifle"></div></details>
<details class="wf"><summary>🎯 Снайперская винтовка</summary><div class="wfmenu" data-wfcat="sniper"></div></details>
<details class="wf"><summary>🔫 Пистолет-пулемёт</summary><div class="wfmenu" data-wfcat="smg"></div></details>
<details class="wf"><summary>🔫 Дробовик</summary><div class="wfmenu" data-wfcat="shotgun"></div></details>
<details class="wf"><summary>🔫 Пулемёт</summary><div class="wfmenu" data-wfcat="machinegun"></div></details>
</div>`;

const CSS=`<style id="weaponFilterStyle">
.wfbar{display:flex;gap:4px;align-items:stretch;margin:0 0 10px;padding:4px;background:#121019;border:1px solid #30283d;border-radius:12px;overflow:visible;position:relative;z-index:30}.wf{position:relative;flex:0 0 auto}.wf summary{list-style:none;cursor:pointer;padding:9px 10px;border-radius:8px;color:#aaa2b6;white-space:nowrap;user-select:none}.wf summary::-webkit-details-marker{display:none}.wf summary:after{content:'⌄';font-size:11px;margin-left:7px;color:#756b83}.wf[open] summary,.wf summary:hover{background:#211c2a;color:#fff}.wf[open] summary:after{content:'⌃'}.wfmenu{position:absolute;top:calc(100% + 6px);left:0;width:230px;max-height:390px;overflow:auto;padding:8px;background:#201e27;border:1px solid #40394d;border-radius:10px;box-shadow:0 18px 45px #0009}.wf:last-child .wfmenu,.wf:nth-last-child(2) .wfmenu{left:auto;right:0}.wfopt{display:flex;align-items:center;gap:10px;padding:8px;border-radius:7px;color:#c7c0cf;cursor:pointer}.wfopt:hover{background:#2a2732;color:#fff}.wfopt input{margin-left:auto;width:17px;height:17px;accent-color:#7c3aed}.wficon{width:32px;text-align:center;color:#8f849b;font-size:11px;font-weight:900}.wfcount{margin-left:3px;color:#746b80;font-size:11px}@media(max-width:1150px){.wfbar{overflow-x:auto;overflow-y:hidden;padding-bottom:5px}.wf[open]{position:static}.wf[open] .wfmenu{position:fixed;left:16px!important;right:16px!important;top:auto;width:auto;z-index:1000}}
</style>`;

const SCRIPT=`<script id="weaponFilterScript">(function(){
var GROUPS={
 pistol:['Glock-18','USP-S','P2000','P250','Five-SeveN','Tec-9','CZ75-Auto','Dual Berettas','Desert Eagle','Револьвер R8','R8 Revolver'],
 rifle:['AK-47','M4A4','M4A1-S','FAMAS','Автомат «Галиль»','Galil AR','AUG','SG 553'],
 sniper:['AWP','SSG 08','SCAR-20','G3SG1'],
 smg:['MAC-10','MP5-SD','MP7','MP9','P90','ПП-19 «Бизон»','PP-Bizon','UMP-45'],
 shotgun:['Nova','XM1014','MAG-7','Sawed-Off','Обрез'],
 machinegun:['M249','Negev'],
 knife:['Нож','Стилет','Керамбит','Наваха','Фальшион','Штык-нож','Штык','Коготь','Боуи','Складной нож','Охотничий нож','Паракорд-нож','Скелетный нож','Нож выживания','Медвежий нож','Нож «Бродяга»','Классический нож']
};
function rootName(n){n=String(n||'').replace(/^(?:(?:StatTrak™|StatTrak)\\s+|Сувенирный\\s+)+/iu,'');return n.split(' | ')[0].trim()}
function same(a,b){return String(a).toLocaleLowerCase('ru')===String(b).toLocaleLowerCase('ru')}
function selected(){return Array.from(document.querySelectorAll('[data-wfmodel]:checked')).map(function(x){return x.getAttribute('data-wfmodel')||''})}
function match(name,model){var r=rootName(name);if(same(r,model))return true;if(model==='Нож')return /нож/i.test(r);return false}
function renderMenus(items){var names=items.map(function(x){return rootName(x.name)});Object.keys(GROUPS).forEach(function(cat){var box=document.querySelector('[data-wfcat="'+cat+'"]');if(!box)return;var models=GROUPS[cat].filter(function(m,i,a){return a.indexOf(m)===i&&names.some(function(n){return match(n,m)})});box.innerHTML=models.map(function(m){var count=items.filter(function(x){return match(x.name,m)}).length;return '<label class="wfopt"><span class="wficon">'+escwf(m)+'</span><span>'+escwf(m)+'</span><span class="wfcount">'+count+'</span><input type="checkbox" data-wfmodel="'+escwf(m)+'"></label>'}).join('')||'<div class="wfopt">Нет предметов</div>'});document.querySelectorAll('[data-wfmodel]').forEach(function(x){x.addEventListener('change',apply)});}
function escwf(s){return String(s).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]})}
function apply(){var pick=selected();document.querySelectorAll('#grid .item').forEach(function(row){var nm=row.querySelector('.name'),ok=!pick.length||(nm&&pick.some(function(m){return match(nm.textContent,m)}));row.style.display=ok?'':'none'});document.querySelectorAll('.wf').forEach(function(d){var n=d.querySelectorAll('[data-wfmodel]:checked').length;d.classList.toggle('has',n>0)});}
function observe(){var g=document.getElementById('grid');if(!g)return;var timer=0,newItems=[];function sync(){clearTimeout(timer);timer=setTimeout(function(){var rows=Array.from(g.querySelectorAll('.item'));newItems=rows.map(function(r){var n=r.querySelector('.name');return {name:n?n.textContent:''}});apply()},20)}new MutationObserver(sync).observe(g,{childList:true,subtree:true});sync()}
function loadCatalog(){fetch('/api/me/economy?wf=1&ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(e){if(e&&Array.isArray(e.shop))renderMenus(e.shop)}).catch(function(){});observe()}
document.querySelectorAll('.wf').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open)return;document.querySelectorAll('.wf[open]').forEach(function(o){if(o!==d)o.removeAttribute('open')})})});document.addEventListener('click',function(e){if(!e.target.closest('.wf'))document.querySelectorAll('.wf[open]').forEach(function(d){d.removeAttribute('open')})});loadCatalog();
})();</script>`;

export function installShopWeaponFilterHotfix(){
  const response:any=(express as any).response;
  const originalSend=response.send;
  response.send=function(body:any){
    if(typeof body==='string'&&body.includes('<title>Магазин — d1psy Rewards</title>')&&!body.includes('id="weaponFilters"')){
      body=body.replace('<input id="search"',BAR+'<input id="search"');
      body=body.replace('</head>',CSS+'</head>');
      body=body.replace('</body>',SCRIPT+'</body>');
    }
    return originalSend.call(this,body);
  };
}
