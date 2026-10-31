import express from 'express';

export function installAccountProfileMenuHotfix(){
 const response:any=(express as any).response, originalSend=response.send;
 response.send=function(body:any){
  if(typeof body==='string'&&body.includes('class="trade-card"')&&body.includes('id="coinBalance"')){
   const trade=/<section class="card trade-card">[\s\S]*?<\/section>/;
   body=body.replace(trade,'');
   body=body.replace('</style>',`\n.profile-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px}.profile-btn{border:1px solid #3b2853;background:#171020;color:#ddd;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:800;cursor:pointer}.profilemodal{position:fixed;inset:0;background:rgba(5,3,9,.76);display:none;align-items:center;justify-content:center;padding:20px;z-index:1400}.profilemodal.open{display:flex}.profilecard{width:min(560px,100%);background:#160d20;border:1px solid #4b2b63;border-radius:18px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.5)}.profilehead{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:15px}.profilehead h3{margin:0}.profileclose{border:0;background:transparent;color:#aaa;font-size:25px;cursor:pointer}.profilecard .trade-card{margin:0;padding:0;background:none;border:0;box-shadow:none}.profilecard .trade-head{margin-bottom:10px}@media(max-width:620px){.profile-actions{justify-content:flex-start}}\n</style>`);
   body=body.replace('<div id="who" class="user">Загрузка…</div>','<div id="who" class="user">Загрузка…</div><div class="profile-actions"><button id="profileBtn" class="profile-btn" type="button">Профиль / Trade URL</button></div>');
   body=body.replace('</body>',`<div id="profileModal" class="profilemodal"><div class="profilecard"><div class="profilehead"><h3>Профиль</h3><button id="profileClose" class="profileclose" type="button">×</button></div><section class="trade-card"><div class="trade-head"><div class="trade-title">Steam Trade URL</div><a class="trade-help" href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url" target="_blank" rel="noopener noreferrer">Где взять трейд-ссылку ↗</a></div><div class="trade-row"><input id="trade" type="url" autocomplete="off" placeholder="https://steamcommunity.com/tradeoffer/new/…"><button id="saveBtn" type="button">Сохранить</button></div><p id="saveState" class="save-state">Нужна для получения приза после победы.</p></section></div></div></body>`);
   body=body.replace("saveBtn.addEventListener('click',save);load();","var profileBtn=document.getElementById('profileBtn'),profileModal=document.getElementById('profileModal'),profileClose=document.getElementById('profileClose');if(profileBtn)profileBtn.onclick=()=>profileModal.classList.add('open');if(profileClose)profileClose.onclick=()=>profileModal.classList.remove('open');if(profileModal)profileModal.onclick=e=>{if(e.target===profileModal)profileModal.classList.remove('open')};saveBtn.addEventListener('click',save);load();");
  }
  return originalSend.call(this,body);
 };
}
