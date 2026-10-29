import express from 'express';

export function installAdminHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path!=='/admin') return originalGet.call(this,path,...handlers);
    return originalGet.call(this,path,(_req:any,res:any)=>res.send(adminHtml()));
  };
}

function adminHtml(){return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rewards Admin</title>
<style>
body{margin:0;background:#0c0912;color:#eee;font:16px system-ui}main{max-width:1150px;margin:auto;padding:36px}.card{background:#15101e;border:1px solid #2c213e;border-radius:16px;padding:22px;margin:18px 0}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,select,input,a{font:inherit}button,a.btn{color:#fff;background:#6d28d9;border:0;border-radius:10px;padding:10px 16px;text-decoration:none;cursor:pointer}button.secondary{background:#312444}button:disabled{opacity:.55;cursor:not-allowed}select,input{padding:10px;border-radius:8px;border:1px solid #3b3150;background:#171020;color:#fff}.muted{color:#a99dbb}.ok{color:#86efac}.bad{color:#fca5a5}.wins{display:grid;gap:10px}.win{display:grid;grid-template-columns:1.1fr 1.4fr 2fr 1fr auto;gap:12px;align-items:center;padding:12px;border:1px solid #302440;border-radius:12px}.label{font-size:13px;color:#a99dbb;margin-bottom:5px}.trade{color:#c4b5fd;word-break:break-all}.status{font-size:14px}pre{white-space:pre-wrap}@media(max-width:800px){.win{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Rewards Admin</h1>
<div class="card"><h2>Управление</h2><p class="muted">Приз для каждого нового раунда выбирается сервером случайно из активных призов.</p><div class="row">
<button id="connectBtn" type="button">Подключить Twitch-чат</button>
<select id="mode"><option value="time">По времени</option><option value="messages">По сообщениям</option></select>
<input id="amount" type="number" value="60" min="60" max="900"><span id="unit" class="muted">секунд (60–900)</span>
<button id="startBtn" type="button">Старт</button><button id="stopBtn" type="button" class="secondary">Стоп</button></div><p id="msg" class="muted"></p></div>
<div class="card"><h2>Состояние</h2><pre id="stateBox">Загрузка…</pre></div>
<div class="card"><h2>Победители и отправка</h2><p class="muted">Steam Trade URL виден только администратору. После ручной отправки скина отметьте выигрыш как отправленный.</p><div id="winsBox" class="wins">Загрузка…</div></div>
<script>
(function(){
 const q=function(id){return document.getElementById(id)};
 const mode=q('mode'),amount=q('amount'),unit=q('unit'),msg=q('msg'),stateBox=q('stateBox'),winsBox=q('winsBox');
 const connectBtn=q('connectBtn'),startBtn=q('startBtn'),stopBtn=q('stopBtn');
 function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c})}
 function syncAmount(){if(mode.value==='messages'){amount.min='50';amount.max='200';amount.value=String(Math.max(50,Math.min(200,Number(amount.value)||100)));unit.textContent='сообщений (50–200)'}else{amount.min='60';amount.max='900';amount.value=String(Math.max(60,Math.min(900,Number(amount.value)||60)));unit.textContent='секунд (60–900)'}}
 function renderWins(list){if(!Array.isArray(list)||!list.length){winsBox.textContent='Победителей пока нет';return}winsBox.innerHTML=list.map(function(w){var u=w.rewards_users||{},p=w.rewards_prizes||{},pending=w.delivery_status!=='received',trade=u.steam_trade_url||'';return '<div class="win"><div><div class="label">Победитель</div><b>'+esc(u.twitch_login||u.twitch_user_id||'—')+'</b></div><div><div class="label">Приз</div>'+esc(p.name||'Приз')+'</div><div><div class="label">Steam Trade URL</div>'+(trade?'<a class="trade" href="'+esc(trade)+'" target="_blank" rel="noopener noreferrer">Открыть Trade URL</a>':'<span class="bad">Нет ссылки</span>')+'</div><div class="status '+(pending?'bad':'ok')+'">'+(pending?'Ожидает отправки':'Получено')+'</div><div>'+(pending?'<button type="button" class="deliverBtn" data-id="'+esc(w.id)+'">Отправлено</button>':'')+'</div></div>'}).join('');Array.prototype.forEach.call(document.querySelectorAll('.deliverBtn'),function(b){b.addEventListener('click',function(){markDelivered(b.getAttribute('data-id'))})})}
 async function load(){try{var r=await fetch('/api/admin/state',{cache:'no-store'});if(r.status===401){stateBox.textContent='Сессия истекла. Войдите через Twitch заново.';winsBox.textContent='Нет доступа';return}if(!r.ok)throw new Error('HTTP '+r.status);var s=await r.json();var round=s.round;stateBox.textContent=JSON.stringify({twitch:s.settings&&s.settings.twitch_connection_status,enabled:!!(s.settings&&s.settings.enabled),round:round?{id:round.id,mode:round.mode,prize:round.rewards_prizes&&round.rewards_prizes.name,message_count:round.message_count}:null,wins:Array.isArray(s.wins)?s.wins.length:0},null,2);renderWins(s.wins)}catch(err){stateBox.textContent='Ошибка загрузки: '+String(err&&err.message||err);winsBox.textContent='Ошибка загрузки'}}
 async function connect(){connectBtn.disabled=true;msg.textContent='Подключение Twitch-чата…';try{var r=await fetch('/api/admin/twitch/connect',{method:'POST'});var j=await r.json().catch(function(){return {}});msg.textContent=r.ok?'Twitch-чат подключён':'Ошибка подключения: '+(j.detail||j.error||r.status)}catch(err){msg.textContent='Ошибка сети: '+String(err)}finally{connectBtn.disabled=false;await load()}}
 async function startRound(){startBtn.disabled=true;msg.textContent='Запускаем раунд…';try{var m=mode.value,n=Number(amount.value),body=m==='messages'?{mode:m,messageThreshold:n}:{mode:m,intervalSeconds:n};var r=await fetch('/api/admin/round/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});var j=await r.json().catch(function(){return {}});msg.textContent=r.ok?'Раунд запущен. Приз: '+((j.rewards_prizes&&j.rewards_prizes.name)||'выбран'):'Старт запрещён: '+(j.error||r.status)}catch(err){msg.textContent='Ошибка сети: '+String(err)}finally{startBtn.disabled=false;await load()}}
 async function stopRound(){stopBtn.disabled=true;try{var r=await fetch('/api/admin/round/stop',{method:'POST'});msg.textContent=r.ok?'Остановлено':'Ошибка остановки: '+r.status}catch(err){msg.textContent='Ошибка сети: '+String(err)}finally{stopBtn.disabled=false;await load()}}
 async function markDelivered(id){if(!id||!confirm('Отметить приз как отправленный?'))return;var r=await fetch('/api/admin/wins/'+encodeURIComponent(id)+'/delivered',{method:'POST'});msg.textContent=r.ok?'Выигрыш отмечен как отправленный':'Не удалось обновить статус';await load()}
 mode.addEventListener('change',syncAmount);connectBtn.addEventListener('click',connect);startBtn.addEventListener('click',startRound);stopBtn.addEventListener('click',stopRound);syncAmount();load();setInterval(load,5000);
})();
</script></main></body></html>`}
