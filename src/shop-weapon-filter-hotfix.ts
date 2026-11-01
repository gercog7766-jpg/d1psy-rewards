import express from 'express';

const BAR=`<div id="weaponFilters" class="wfbar">
<details class="wf"><summary><span class="wfsym">●</span>Пистолет</summary><div class="wfmenu" data-wfcat="pistol"></div></details>
<details class="wf"><summary><span class="wfsym">◆</span>Винтовка</summary><div class="wfmenu" data-wfcat="rifle"></div></details>
<details class="wf"><summary><span class="wfsym">✦</span>Снайперская винтовка</summary><div class="wfmenu" data-wfcat="sniper"></div></details>
<details class="wf"><summary><span class="wfsym">▸</span>Пистолет-пулемёт</summary><div class="wfmenu" data-wfcat="smg"></div></details>
<details class="wf"><summary><span class="wfsym">▰</span>Дробовик</summary><div class="wfmenu" data-wfcat="shotgun"></div></details>
<details class="wf"><summary><span class="wfsym">▮</span>Пулемёт</summary><div class="wfmenu" data-wfcat="machinegun"></div></details>
</div>`;

const CSS=`<style id="weaponFilterStyle">
.wfbar{display:flex;gap:2px;align-items:stretch;margin:0 0 10px;padding:3px;background:#121019;border:1px solid #30283d;border-radius:10px;overflow:visible;position:relative;z-index:30}.wf{position:relative;flex:0 0 auto}.wf summary{list-style:none;display:flex;align-items:center;gap:7px;cursor:pointer;padding:9px 10px;border-radius:7px;color:#aaa2b6;white-space:nowrap;user-select:none}.wf summary::-webkit-details-marker{display:none}.wf summary:after{content:'⌄';font-size:11px;margin-left:2px;color:#756b83}.wf[open] summary,.wf summary:hover,.wf.has summary{background:#27232f;color:#fff}.wf[open] summary:after{content:'⌃'}.wfsym{width:15px;color:#8d8499;font-size:11px;text-align:center}.wfmenu{position:absolute;top:calc(100% + 5px);left:0;width:242px;max-height:390px;overflow:auto;padding:7px 0;background:#29272e;border:1px solid #403c48;border-radius:5px;box-shadow:0 18px 45px #000a}.wf:last-child .wfmenu,.wf:nth-last-child(2) .wfmenu{left:auto;right:0}.wfall,.wfopt{display:flex;align-items:center;min-height:43px;padding:6px 12px;color:#c7c3cc;cursor:pointer}.wfall{border-bottom:1px solid #3a3740;margin-bottom:2px}.wfopt:hover,.wfall:hover{background:#34313a;color:#fff}.wfthumb{width:46px;height:30px;display:flex;align-items:center;justify-content:center;margin-right:8px;flex:0 0 46px}.wfthumb img{width:44px;height:28px;object-fit:contain}.wfmodel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wfopt input,.wfall input{margin-left:auto;width:16px;height:16px;accent-color:#7c3aed;flex:0 0 auto}.wfempty{padding:14px;color:#827b8c}@media(max-width:1150px){.wfbar{overflow-x:auto;overflow-y:hidden;padding-bottom:5px}.wf[open]{position:static}.wf[open] .wfmenu{position:fixed;left:16px!important;right:16px!important;top:auto;width:auto;z-index:1000}}
</style>`;

const SCRIPT=`<script id="weaponFilterScript">(function(){
var GROUPS={
 pistol:['Glock-18','USP-S','P2000','P250','Five-SeveN','Tec-9','CZ75-Auto','Dual Berettas','Desert Eagle','Револьвер R8','R8 Revolver'],
 rifle:['AK-47','M4A4','M4A1-S','FAMAS','Автомат «Галиль»','Galil AR','AUG','SG 553'],
 sniper:['AWP','SSG 08','SCAR-20','G3SG1'],
 smg:['MAC-10','MP5-SD','MP7','MP9','P90','ПП-19 «Бизон»','PP-Bizon','UMP-45'],
 shotgun:['Nova','XM1014','MAG-7','Sawed-Off','Обрез'],
 machinegun:['M249','Negev']
};
function rootName(n){n=String(n||'').replace(/^(?:(?:StatTrak™|StatTrak)\\s+|Сувенирный\\s+)+/iu,'');return n.split(' | ')[0].trim()}
function same(a,b){return String(a).toLocaleLowerCase('ru')===String(b).toLocaleLowerCase('ru')}
function selected(){return Array.from(document.querySelectorAll('[data-wfmodel]:checked')).map(function(x){return x.getAttribute('data-wfmodel')||''})}
function match(name,model){return same(rootName(name),model)}
function escwf(s){return String(s).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]})}
function redraw(){document.querySelectorAll('.wf').forEach(function(d){d.classList.toggle('has',d.querySelectorAll('[data-wfmodel]:checked').length>0)});var s=document.getElementById('search');if(s)s.dispatchEvent(new Event('input',{bubbles:true}))}
function resetWeaponFilters(){document.querySelectorAll('[data-wfmodel],[data-wfall]').forEach(function(x){x.checked=false});document.querySelectorAll('.wf').forEach(function(d){d.classList.remove('has');d.removeAttribute('open')})}
window.D1WeaponFilter=function(name){var pick=selected();return !pick.length||pick.some(function(m){return match(name,m)})};
function renderMenus(items){Object.keys(GROUPS).forEach(function(cat){var box=document.querySelector('[data-wfcat="'+cat+'"]');if(!box)return;var models=GROUPS[cat].filter(function(m,i,a){return a.indexOf(m)===i&&items.some(function(x){return match(x.name,m)})});var h='<label class="wfall"><span>Выбрать все</span><input type="checkbox" data-wfall="'+cat+'"></label>';h+=models.map(function(m){var item=items.find(function(x){return match(x.name,m)&&x.image_url});var img=item&&item.image_url?'<img src="'+escwf(item.image_url)+'" alt="">':'';return '<label class="wfopt"><span class="wfthumb">'+img+'</span><span class="wfmodel">'+escwf(m)+'</span><input type="checkbox" data-wfcatmodel="'+cat+'" data-wfmodel="'+escwf(m)+'"></label>'}).join('');box.innerHTML=models.length?h:'<div class="wfempty">Нет предметов</div>'});document.querySelectorAll('[data-wfmodel]').forEach(function(x){x.addEventListener('change',function(){syncAll(x.getAttribute('data-wfcatmodel'));redraw()})});document.querySelectorAll('[data-wfall]').forEach(function(x){x.addEventListener('change',function(){var cat=x.getAttribute('data-wfall');document.querySelectorAll('[data-wfcatmodel="'+cat+'"]').forEach(function(c){c.checked=x.checked});redraw()})})}
function syncAll(cat){if(!cat)return;var a=Array.from(document.querySelectorAll('[data-wfcatmodel="'+cat+'"]')),all=document.querySelector('[data-wfall="'+cat+'"]');if(all)all.checked=!!a.length&&a.every(function(x){return x.checked})}
function bindReset(){var b=document.getElementById('reset');if(!b||b.dataset.wfReset)return;b.dataset.wfReset='1';b.addEventListener('click',function(){resetWeaponFilters()})}
function loadCatalog(){fetch('/api/me/economy?wf=1&ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(e){if(e&&Array.isArray(e.shop))renderMenus(e.shop);bindReset()}).catch(function(){bindReset()})}
document.querySelectorAll('.wf').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open)return;document.querySelectorAll('.wf[open]').forEach(function(o){if(o!==d)o.removeAttribute('open')})})});document.addEventListener('click',function(e){if(!e.target.closest('.wf'))document.querySelectorAll('.wf[open]').forEach(function(d){d.removeAttribute('open')})});bindReset();loadCatalog();
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
    if(typeof body==='string'&&body.includes("function ok(x){var name=String(x.name||'').toLowerCase()")&&!body.includes('window.D1WeaponFilter&&!window.D1WeaponFilter(x.name)')){
      body=body.replace("if(t&&name.indexOf(t)<0)return false;if(!P)return true;","if(t&&name.indexOf(t)<0)return false;if(window.D1WeaponFilter&&!window.D1WeaponFilter(x.name))return false;if(!P)return true;");
    }
    return originalSend.call(this,body);
  };
}
