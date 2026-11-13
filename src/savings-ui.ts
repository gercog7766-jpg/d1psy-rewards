const css = String.raw`
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 0,#321a46,#0c0913 66%);color:#fbf5ff;font:16px/1.5 system-ui,sans-serif}main{width:min(100% - 32px,1080px);margin:auto;padding:26px 0 56px}a{color:inherit}h1{font-size:clamp(34px,6vw,52px);line-height:1.05;margin:14px 0 8px}h2{font-size:20px;margin:0 0 12px}p{color:#d2c1df}.muted{color:#b6a4c4;font-size:13px}.panel{border:1px solid #614078;border-radius:18px;background:linear-gradient(145deg,#21152c,#150f1d);padding:22px}.layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:16px}.pig-panel{display:grid;place-items:center;min-height:470px;overflow:hidden;background:radial-gradient(ellipse at 50% 70%,#69358955,transparent 57%),linear-gradient(145deg,#24132f,#130d1b)}.pig-wrap{position:relative;width:min(100%,440px);aspect-ratio:1.095;isolation:isolate;filter:drop-shadow(0 24px 32px #0007);animation:float 4.6s ease-in-out infinite}.pig-wrap img{position:absolute;display:block;object-fit:contain;pointer-events:none}.pig-body{inset:0;width:100%;height:100%}.accessory{z-index:2}.tint{position:absolute;z-index:3;inset:0;background:var(--tint);mix-blend-mode:color;opacity:.88;pointer-events:none;mask-image:var(--mask);mask-repeat:no-repeat;mask-size:100% 100%;-webkit-mask-image:var(--mask);-webkit-mask-repeat:no-repeat;-webkit-mask-size:100% 100%}.pig-tint{--mask:url('/savings/assets/pig-glasses.webp');background:var(--pig-color)}.float{animation:float 4.6s ease-in-out infinite}.spendable{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #62407d;border-radius:11px;background:#271936}.spendable strong{color:#ffda82}.controls{display:grid;align-content:start;gap:14px}.copy{margin:0 0 6px;color:#cbb9d7}.row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.row>*{flex:1}.field{display:grid;gap:6px;font-weight:700}input,select,button{font:inherit;color:#fbf5ff;border:1px solid #674983;border-radius:10px;background:#120c19;padding:11px 13px}input[type=number],input[type=date]{width:100%}button{background:linear-gradient(135deg,#913cdf,#6428b2);font-weight:800;cursor:pointer;box-shadow:0 8px 20px #641fb42e}button.secondary{background:#24182f;box-shadow:none}button.danger{background:#311a28;border-color:#98506b;box-shadow:none}button:disabled{opacity:.55;cursor:default}.wide{width:100%}.choice{display:flex;gap:10px}.choice label{flex:1;display:flex;align-items:center;gap:8px;border:1px solid #57396d;border-radius:10px;background:#181020;padding:10px}.notice{min-height:22px;color:#e6c8ff}.notice.error{color:#ff9ba9}.saved-title{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#caa8ea}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions button{flex:1}.controls-footer{border-top:1px solid #493259;padding-top:14px}.controls>.notice:empty{min-height:0;margin-block:-7px}.controls #start{margin-top:12px;min-height:44px}.controls-footer button{min-height:44px}.start-terms{margin:16px 0 20px;padding:4px 14px;border:1px solid #614078;border-radius:12px;background:#130d1b}.start-terms div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:10px 0}.start-terms div+div{border-top:1px solid #493259}.start-terms dd{margin:0;font-weight:800;color:#e9c8ff;white-space:nowrap}#startDialog .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#startDialog button{min-height:44px}.state-label{color:#f1d48f;font-weight:800}.dialog{width:min(520px,calc(100% - 24px));padding:0;border:1px solid #8158a1;border-radius:18px;background:#1b1224;color:#fff;box-shadow:0 25px 100px #000b}.dialog::backdrop{background:#08050dcc;backdrop-filter:blur(5px)}.dialog-inner{padding:22px}.dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.dialog-head h2{margin:0}.close{flex:0 0 auto;padding:7px 10px}.palette{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin:12px 0 18px}.swatch{width:100%;aspect-ratio:1;border-radius:9px;padding:0;border:2px solid #ffffff44;box-shadow:none}.swatch.selected{outline:2px solid #fff;outline-offset:2px}.color-row{display:grid;grid-template-columns:1fr 56px;gap:10px;align-items:center}.color-row input[type=color]{width:56px;height:44px;padding:4px;cursor:pointer}.preview-small{position:relative;width:150px;aspect-ratio:1.095;margin:12px auto 18px}.preview-small img{position:absolute;width:100%;height:100%;object-fit:contain}.admin-pig{width:62px;flex:none;isolation:isolate;margin:0}.admin-row{align-items:center}.admin-row strong{margin-left:auto;white-space:nowrap}.history-item{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #51385f;font-size:13px}.history-item small{color:#b6a4c4}[hidden]{display:none!important}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@media(max-width:760px){main{width:min(100% - 22px,560px);padding:18px 0 38px}.layout{grid-template-columns:1fr}.pig-panel{min-height:340px;padding:14px}.pig-wrap{width:min(92%,340px)}.panel{padding:17px}.actions{display:grid;grid-template-columns:1fr}.palette{grid-template-columns:repeat(6,1fr)}}@media(prefers-reduced-motion:reduce){.pig-wrap,.coin-rain i{animation:none!important}}
`;

const palette=['#7d24ff','#be2bff','#f22ac7','#ff3e9d','#ff315b','#ff6c4f','#ff9d00','#ffd500','#e8f044','#a5ff32','#48ff70','#00dfa7','#00dbe8','#2588ff','#465dff','#a8a8b3','#dedee5','#ffffff','#17131f','#674983'];

export function savingsPage(admin=false){
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Накопления · Dropso</title><style>${css}</style></head><body data-admin="${admin}"><main><a href="${admin?'/admin':'/account'}">← ${admin?'Админка':'На главную'}</a><h1>Накопления</h1>${admin?`<section class="panel"><h2>Личные накопления</h2><div id="adminStats" class="muted">Загрузка…</div><div id="adminRows"></div><div class="actions"><button id="prevPage" class="secondary" disabled>Назад</button><button id="nextPage" class="secondary" disabled>Далее</button></div><p id="notice" class="notice" role="status"></p></section>`:`<p class="copy">Откладывай монеты вручную и решай сам, когда продолжить или забрать накопленное.</p><div class="layout"><section class="panel pig-panel" aria-label="Твоя копилка"><div id="pig" class="pig-wrap" style="--pig-color:#a5a5a9"><img class="pig-body" src="/savings/assets/pig-glasses.webp" width="1312" height="1199" alt="Свинья-копилка в очках"><i class="tint pig-tint"></i></div></section><section class="panel controls"><div class="spendable"><span>Баланс</span><strong id="savingsBalance">—</strong></div><div id="setup"><div class="saved-title">Начни копить</div><p class="muted">Выбери условие окончания. Цель по сумме — от 500 монет. Срок — от 10 дней.</p><div class="choice"><label><input type="radio" name="goalType" value="amount" checked> Сумма</label><label><input type="radio" name="goalType" value="date"> Дата</label></div><label id="amountField" class="field">Цель накопления, монет<input id="goalAmount" type="number" min="500" step="1" value="500" inputmode="numeric"></label><label id="dateField" class="field" hidden>Дата окончания<input id="goalAt" type="date"></label><button id="start" class="wide" disabled>Включить копилку</button></div><div id="active" hidden><div class="saved-title">Копилка работает</div><p id="goalLabel" class="muted"></p><label class="field">Внести монеты<input id="depositAmount" type="number" min="1" step="1" value="50" inputmode="numeric"></label><button id="deposit" class="wide">Положить в копилку</button><div id="readyActions" class="actions" hidden><button id="extend" class="secondary">Продлить</button><button id="break" class="danger">Разбить</button></div><div id="extendForm" hidden><p class="muted">Продление бесплатно. Выбери новую цель: ещё от 500 монет или срок от 10 дней.</p><div class="choice"><label><input type="radio" name="extendType" value="amount" checked> Сумма</label><label><input type="radio" name="extendType" value="date"> Дата</label></div><label id="extendAmountField" class="field">Добавить к цели, монет<input id="extendAmount" type="number" min="500" step="1" value="500"></label><label id="extendDateField" class="field" hidden>Дата окончания<input id="extendAt" type="date"></label><div class="actions"><button id="confirmExtend">Сохранить продление</button><button id="cancelExtend" class="secondary">Отмена</button></div></div></div><div class="notice" id="notice" role="status" aria-live="polite"></div><footer class="controls-footer"><button id="customize" class="secondary wide">Настроить цвета</button></footer></section></div><dialog id="startDialog" class="dialog" aria-labelledby="startTitle" aria-describedby="startDetails"><form id="startForm" method="dialog" class="dialog-inner"><h2 id="startTitle">Включить копилку?</h2><dl id="startDetails" class="start-terms"><div><dt>Активация</dt><dd id="startFee"></dd></div><div><dt>Комиссия при разбитии</dt><dd id="startRate"></dd></div></dl><div class="actions"><button type="submit" value="cancel" class="secondary" autofocus>Отмена</button><button type="submit" value="confirm">Включить</button></div></form></dialog><dialog id="colorDialog" class="dialog"><div class="dialog-inner"><div class="dialog-head"><h2>Настроить цвета</h2><button id="closeColors" class="secondary close" type="button">Закрыть</button></div><p class="muted">Общий цвет свиньи и очков</p><div id="smallPreview" class="preview-small"><img class="pig-body" src="/savings/assets/pig-glasses.webp" alt=""><i class="tint pig-tint"></i></div><label class="field" for="colorPicker">Цвет</label><div class="color-row"><span id="colorValue"></span><input id="colorPicker" type="color" value="#a5a5a9" aria-label="Выбрать цвет"></div><div id="palette" class="palette"></div><button id="saveColors" class="wide">Сохранить цвета</button><p id="colorNotice" class="notice" role="status"></p></div></dialog>`}</main><script src="/savings.js" defer></script></body></html>`;
}

export const savingsScript=String.raw`
(()=>{
 const $=id=>document.getElementById(id), admin=document.body.dataset.admin==='true';let state=null,busy=false;
 const defaults={pig:'#a5a5a9'};
 let colors={...defaults};
 const presets=${JSON.stringify(palette)};
 const setColor=(key,value)=>{colors[key]=value;const pig=$('pig');if(pig){pig.style.setProperty('--'+key+'-color',value)}const small=$('smallPreview');if(small){small.style.setProperty('--'+key+'-color',value)}};
 function notice(message,error=false,target='notice'){const n=$(target);if(!n)return;n.textContent=message;n.classList.toggle('error',error)}
 function request(path,payload){return fetch(path,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Не удалось выполнить запрос.');return d})}
 function requestId(){return crypto.randomUUID()}
 function paint(){for(const k of Object.keys(colors))setColor(k,colors[k])}
 function localDateMin(input){const d=new Date();d.setDate(d.getDate()+10);const date=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);input.min=date;if(!input.value||input.value<date)input.value=date}
 function localEndIso(value){const d=new Date(value+'T23:59:59');return d.toISOString()}
 function render(d){state=d;$('savingsBalance').textContent=Number(d.balance).toLocaleString('ru-RU')+' мон.';colors={...defaults,...d.colors};paint();const active=d.status==='active'||d.status==='ready';$('setup').hidden=active;$('active').hidden=!active;$('customize').hidden=false;if(active){$('goalLabel').textContent=d.goalType==='date'?'Цель по сроку · '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'long'}).format(new Date(d.goalAt)):'Цель по сумме';$('deposit').hidden=d.status==='ready';$('readyActions').hidden=d.status!=='ready';$('extendForm').hidden=true}$('start').disabled=false;localDateMin($('goalAt'));localDateMin($('extendAt'));}
 async function load(){try{const d=await request('/api/savings');render(d);notice('')}catch(e){notice(errorMessage(e,'Не удалось загрузить накопления. Обнови страницу.'),true)}}
 if(admin){
  let page=1;
  const prev=$('prevPage'),next=$('nextPage');
  async function loadPage(target){
   prev.disabled=next.disabled=true;
   notice('');
   try{
    const data=await request('/api/admin/savings?page='+target);
    page=target;
    $('adminStats').textContent='Копилки пользователей · страница '+page;
    $('adminRows').replaceChildren(...data.rows.map(entry=>{
     const row=document.createElement('div');
     row.className='history-item admin-row';
     const pig=document.createElement('div');
     pig.className='preview-small admin-pig';
     if(/^#[0-9a-f]{6}$/i.test(entry.color))pig.style.setProperty('--pig-color',entry.color);
     const img=document.createElement('img');
     img.src='/savings/assets/pig-glasses.webp';img.alt='';img.loading='lazy';
     const tint=document.createElement('i');
     tint.className='tint pig-tint';
     pig.append(img,tint);
     const label=document.createElement('span');
     label.textContent=entry.name+(entry.login&&entry.login!==entry.name?' (@'+entry.login+')':'')+' · '+({ready:'Можно разбить',active:'Активна',idle:'Не активна'}[entry.status]||'');
     const amount=document.createElement('strong');
     amount.textContent=BigInt(entry.saved).toLocaleString('ru-RU')+' мон.';
     row.append(pig,label,amount);
     return row;
    }));
    if(!data.rows.length)$('adminRows').textContent='Копилок пока нет.';
    prev.disabled=page===1;next.disabled=!data.hasNext;
   }catch(e){
    notice(errorMessage(e,'Не удалось загрузить список копилок.'),true);
    prev.disabled=page===1;next.disabled=false;
   }
  }
  prev.onclick=()=>loadPage(page-1);next.onclick=()=>loadPage(page+1);
  loadPage(1);
  return;
 }
 function goal(type,prefix=''){return type==='amount'?{goalType:'amount',amount:$(prefix?'extendAmount':'goalAmount').value}:{goalType:'date',goalAt:localEndIso($(prefix?'extendAt':'goalAt').value)}}
 document.querySelectorAll('input[name="goalType"]').forEach(r=>r.onchange=()=>{const date=document.querySelector('input[name="goalType"]:checked').value==='date';$('amountField').hidden=date;$('dateField').hidden=!date});
 document.querySelectorAll('input[name="extendType"]').forEach(r=>r.onchange=()=>{const date=document.querySelector('input[name="extendType"]:checked').value==='date';$('extendAmountField').hidden=date;$('extendDateField').hidden=!date});
 let pendingStart=null;
 $('start').onclick=()=>{
  if(busy||!state)return;
  const type=document.querySelector('input[name="goalType"]:checked').value;
  if(type==='date'&&!$('goalAt').value)return notice('Выбери дату окончания.',true);
  const selectedGoal=goal(type);
  if(type==='amount'&&(!/^[1-9]\d*$/.test(selectedGoal.amount)||Number(selectedGoal.amount)<500)){
   return notice('Минимальная цель — 500 монет.',true);
  }
  if(type==='date'&&Date.parse(selectedGoal.goalAt)<Date.now()+10*86400000){
   return notice('Выбери дату не раньше чем через 10 дней.',true);
  }
  pendingStart=selectedGoal;
  $('startFee').textContent=state.nextActivationFee?state.nextActivationFee+' монет':'Бесплатно';
  $('startRate').textContent=(state.nextCommissionBps/100).toLocaleString('ru-RU')+'%';
  $('startDialog').showModal();
 };
 $('startForm').onsubmit=async event=>{
  if(event.submitter?.value!=='confirm')return;
  event.preventDefault();
  if(busy||!pendingStart)return;
  const selectedGoal=pendingStart;
  $('startDialog').close();
  busy=true;
  $('start').disabled=true;
  try{
   await request('/api/savings/start',{...selectedGoal,requestId:requestId()});
   await load();
   if(state.status==='active'||state.status==='ready')notice('Копилка включена.');
  }catch(e){notice(errorMessage(e),true)}
  finally{busy=false;$('start').disabled=false}
 };
 $('deposit').onclick=async()=>{if(busy)return;const amount=$('depositAmount').value.trim();if(!/^[1-9]\d*$/.test(amount))return notice('Введи количество монет от 1.',true);if(!await window.dropsoConfirm('Внести '+amount+' монет в накопления?'))return;busy=true;try{await request('/api/savings/deposit',{amount,requestId:requestId()});notice('Взнос добавлен.');$('depositAmount').value='';await load()}catch(e){notice(errorMessage(e),true)}finally{busy=false}};
 $('extend').onclick=()=>{$('extendForm').hidden=false;$('deposit').hidden=true;$('readyActions').hidden=true};$('cancelExtend').onclick=()=>{if(state?.status==='ready'){$('extendForm').hidden=true;$('readyActions').hidden=false}};
 $('confirmExtend').onclick=async()=>{if(busy)return;const t=document.querySelector('input[name="extendType"]:checked').value,g=goal(t,'extend');if(t==='amount'&&Number(g.amount)<500)return notice('Добавь к цели не менее 500 монет.',true);if(t==='date'&&new Date(g.goalAt).getTime()<Date.now()+10*86400000)return notice('Выбери дату не раньше чем через 10 дней.',true);busy=true;try{await request('/api/savings/extend',{...g,requestId:requestId()});await load();notice('Копилка продлена.')}catch(e){notice(errorMessage(e),true)}finally{busy=false}};
 $('break').onclick=async()=>{if(busy||!await window.dropsoConfirm('Разбить копилку? Монеты после комиссии вернутся на баланс.'))return;busy=true;try{await request('/api/savings/break',{requestId:requestId()});await load();notice('Копилка разбита. Монеты зачислены на баланс.')}catch(e){notice(errorMessage(e),true)}finally{busy=false}};
 $('customize').onclick=()=>{updatePicker();$('colorDialog').showModal()};$('closeColors').onclick=()=>$('colorDialog').close();$('colorPicker').oninput=()=>{const k='pig';setColor(k,$('colorPicker').value);$('colorValue').textContent=$('colorPicker').value.toUpperCase();document.querySelectorAll('.swatch').forEach(b=>b.classList.toggle('selected',b.dataset.color===$('colorPicker').value))};
 function updatePicker(){const k='pig';$('colorPicker').value=colors[k];$('colorValue').textContent=colors[k].toUpperCase();$('palette').replaceChildren(...presets.map(color=>{const b=document.createElement('button');b.type='button';b.className='swatch'+(color===colors[k]?' selected':'');b.dataset.color=color;b.style.backgroundColor=color;b.setAttribute('aria-label',color);b.onclick=()=>{$('colorPicker').value=color;$('colorPicker').dispatchEvent(new Event('input'))};return b}))}
 $('saveColors').onclick=async()=>{busy=true;$('saveColors').disabled=true;try{await request('/api/savings/colors',colors);paint();$('colorDialog').close();notice('Цвета сохранены.')}catch(e){notice(errorMessage(e),true,'colorNotice')}finally{busy=false;$('saveColors').disabled=false}};
 function errorMessage(e,fallback='Не удалось выполнить действие. Попробуй ещё раз.'){return ({insufficient_coins:'На балансе не хватает монет.',participation_restricted:'Для аккаунта ограничено участие.',cycle_not_ready:'Копилку пока нельзя разбить или продлить.',invalid_goal:'Проверь цель: сумма минимум 500 монет или дата минимум через 10 дней.',already_active:'Копилка уже работает.'})[e.message]||fallback}
 load();
})();
`;
