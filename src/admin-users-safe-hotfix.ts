import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
async function allCoinTransactions(userId?:string){
 const rows:any[]=[];
 for(let offset=0;offset<100000;offset+=500){
  let query=db.from('rewards_coin_transactions').select(userId?'id,amount,transaction_type,note,created_at':'user_id,amount').order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(userId)query=query.eq('user_id',userId);
  const {data,error}=await query;
  if(error)throw error;
  rows.push(...(data||[]));
  if((data||[]).length<500)return rows;
 }
 throw new Error('coin_history_exceeds_safe_pagination_limit');
}
export async function allAdminWins(client:any=db){
 const rows:any[]=[];
 for(let offset=0;offset<100000;offset+=500){
  const {data,error}=await client.from('rewards_wins').select('id,user_id,choice_status,delivery_status,rewards_prizes(sell_price_coins)').order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  rows.push(...(data||[]));
  if((data||[]).length<500)return rows;
 }
 throw new Error('inventory_history_exceeds_safe_pagination_limit');
}
export function adminInventoryValue(w:any){
 if(w.choice_status!=='awaiting_choice'||!['pending','awaiting_choice'].includes(w.delivery_status))return 0;
 const p=Array.isArray(w.rewards_prizes)?w.rewards_prizes[0]:w.rewards_prizes;
 return Number(p?.sell_price_coins||0);
}
function levelFromXp(x:number){return Math.max(1,Math.floor((Math.sqrt(9+8*Math.max(0,x)/75)-3)/2)+1)}
function xpForLevel(level:number){return Math.round(37.5*(level-1)*(level+2))}

export function installAdminUsersSafeHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalListen=proto.listen;
 let adminAuth:any=null;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state' && handlers.length>1) adminAuth=handlers[0];
  if(path==='/admin') handlers=handlers.map((handler:any)=>function(req:any,res:any,next:any){const send=res.send.bind(res);res.send=(body:any)=>send(typeof body==='string'?enhanceAdmin(body):body);return handler(req,res,next)});
  return originalGet.call(this,path,...handlers);
 };
 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__adminUsersSafeInstalled && adminAuth){
   app.locals.__adminUsersSafeInstalled=true;
   app.get('/api/admin/users',adminAuth,async(_req:any,res:any)=>{
    const [{data:users,error:uErr},{data:wins,error:wErr},coinResult]=await Promise.all([
     db.from('rewards_users').select('id,twitch_user_id,twitch_login,twitch_display_name,steam_trade_url_valid,created_at,participation_restricted,banned,xp_total').order('created_at',{ascending:false}),
     allAdminWins().then(data=>({data,error:null})).catch(error=>({data:null,error})),
     allCoinTransactions().then(data=>({data,error:null})).catch(error=>({data:null,error}))
    ]);
    const {data:coinTx,error:cErr}=coinResult;
    if(uErr||wErr||cErr)return res.status(500).json({error:'users_load_failed'});
    const winsCount=new Map<string,number>(),balances=new Map<string,number>(),inventoryValues=new Map<string,number>();
    for(const t of coinTx||[])balances.set(t.user_id,(balances.get(t.user_id)||0)+Number(t.amount||0));
    for(const w of wins||[]){
     winsCount.set(w.user_id,(winsCount.get(w.user_id)||0)+1);
     inventoryValues.set(w.user_id,(inventoryValues.get(w.user_id)||0)+adminInventoryValue(w));
    }
    const list=(users||[]).map((u:any)=>({...u,level:levelFromXp(Number(u.xp_total||0)),wins_count:winsCount.get(u.id)||0,coin_balance:balances.get(u.id)||0,inventory_value_coins:inventoryValues.get(u.id)||0}));
    res.json({users:list,userStats:{total:list.length,withTrade:list.filter((u:any)=>u.steam_trade_url_valid).length,withoutTrade:list.filter((u:any)=>!u.steam_trade_url_valid).length}});
   });
   app.get('/api/admin/users/:id/coins',adminAuth,async(req:any,res:any)=>{
    const [{data:user,error:uErr},txResult]=await Promise.all([
     db.from('rewards_users').select('id,twitch_login,twitch_display_name').eq('id',req.params.id).maybeSingle(),
     allCoinTransactions(req.params.id).then(data=>({data,error:null})).catch(error=>({data:null,error}))
    ]);
    const {data:tx,error:tErr}=txResult;
    if(uErr||!user)return res.status(404).json({error:'user_not_found'});
    if(tErr)return res.status(500).json({error:'coin_history_load_failed'});
    let balance=0;
    const history=(tx||[]).map((t:any)=>{balance+=Number(t.amount||0);return {...t,balance_after:balance}}).reverse();
    res.json({user,balance,history});
   });
   app.post('/api/admin/users/:id/level',adminAuth,async(req:any,res:any)=>{
    const level=Math.trunc(Number(req.body?.level));
    if(!Number.isFinite(level)||level<1||level>50)return res.status(400).json({error:'invalid_level'});
    const {data:u,error:uErr}=await db.from('rewards_users').select('id,xp_total').eq('id',req.params.id).maybeSingle();
    if(uErr||!u)return res.status(404).json({error:'user_not_found'});
    const oldXp=Number(u.xp_total||0),nextXp=xpForLevel(level),delta=nextXp-oldXp;
    const {error}=await db.from('rewards_users').update({xp_total:nextXp,updated_at:new Date().toISOString()}).eq('id',u.id);
    if(error)return res.status(500).json({error:'level_update_failed'});
    if(delta!==0)await db.from('rewards_xp_history').insert({user_id:u.id,amount:delta,reason:'Админ установил LVL '+level,source_type:'admin_level_set',source_id:'level-'+Date.now()+'-'+u.id});
    res.json({ok:true,level,xp_total:nextXp});
   });
   app.post('/api/admin/users/:id/moderation',adminAuth,async(req:any,res:any)=>{
    const action=String(req.body?.action||''),patch:any={updated_at:new Date().toISOString()};
    if(action==='restrict'){patch.participation_restricted=true;patch.banned=false}else if(action==='restore'){patch.participation_restricted=false;patch.banned=false}else if(action==='ban'){patch.banned=true;patch.participation_restricted=true}else if(action==='unban'){patch.banned=false;patch.participation_restricted=false}else return res.status(400).json({error:'invalid_action'});
    const {data,error}=await db.from('rewards_users').update(patch).eq('id',req.params.id).select('id,participation_restricted,banned').maybeSingle();
    if(error)return res.status(500).json({error:'moderation_update_failed'});if(!data)return res.status(404).json({error:'user_not_found'});
    res.json({ok:true,user:data});
   });
  }
  return originalListen.apply(this,args);
 };
}

function enhanceAdmin(body:string){
 const css='<style>.userHead,.userRow{grid-template-columns:minmax(130px,1.25fr) minmax(100px,.8fr) minmax(75px,.65fr) minmax(55px,.42fr) minmax(70px,.55fr) minmax(80px,.62fr) minmax(205px,1.65fr)!important;column-gap:12px}.coinValue{font-weight:800;color:#fcd34d;white-space:nowrap}.inventoryValue{font-weight:800;color:#c4b5fd;white-space:nowrap}.userCoinLink{color:inherit;text-decoration:underline;text-decoration-color:#7c3aed;text-underline-offset:3px;cursor:pointer}.userCoinLink:hover{color:#c4b5fd}.coinModal{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:9999;padding:20px}.coinModal.open{display:flex}.coinModalCard{width:min(760px,96vw);max-height:82vh;overflow:auto;background:#130d1d;border:1px solid #3b2b52;border-radius:14px;padding:18px}.coinModalHead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.coinModalClose{background:#31233f;padding:7px 11px}.coinHistoryRow{display:grid;grid-template-columns:145px 1fr 90px 90px;gap:10px;padding:9px 0;border-top:1px solid #2b2038;align-items:center}.coinPlus{color:#86efac;font-weight:800}.coinMinus{color:#fca5a5;font-weight:800}.coinNote{font-size:11px;color:#a99bb8;margin-top:2px}.modActions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.modActions button{padding:6px 9px;font-size:11px}.lvlInput{width:58px;padding:6px 7px;font-size:11px}.lvlSetBtn{background:#6d28d9}.restrictBtn{background:#92400e}.banBtn{background:#991b1b}.restoreBtn{background:#166534}.statusBan{color:#fca5a5}.statusRestrict{color:#fcd34d}</style>';
 body=body.replace('</head>',css+'</head>');
 const headStart=body.indexOf('<div class="userHead">');
 const rowsStart=headStart>=0?body.indexOf('<div id="userRows">',headStart):-1;
 if(headStart>=0&&rowsStart>headStart){body=body.slice(0,headStart)+'<div class="userHead"><div>Пользователь</div><div>Регистрация</div><div>Trade URL</div><div>Побед</div><div>Монеты</div><div>Инвентарь</div><div>Управление / LVL</div></div>'+body.slice(rowsStart)}
 const marker="async function markSent(id){";
 const helpers="async function setUserLevel(id,level){level=Number(level);if(!Number.isInteger(level)||level<1||level>50){window.dropsoNotice('Укажи LVL от 1 до 50');return}let r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/level',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({level})});if(!r.ok){window.dropsoNotice('Не удалось изменить LVL');return}await load()}async function moderateUser(id,action){let labels={restrict:'Ограничить участие пользователя?',restore:'Вернуть пользователю участие?',ban:'Заблокировать пользователя?',unban:'Снять блокировку?'};if(!await window.dropsoConfirm(labels[action]||'Подтвердить?'))return;let r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/moderation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});if(!r.ok){window.dropsoNotice('Не удалось изменить статус');return}await load()}function coinTypeLabel(t){return ({adjustment:'Корректировка',level_reward:'Награда за LVL',shop_purchase:'Покупка',win_sale:'Продажа приза'})[t]||t||'Операция'}function closeCoinHistory(){let m=$('coinHistoryModal');if(m)m.classList.remove('open')}async function openCoinHistory(id){let m=$('coinHistoryModal'),b=$('coinHistoryBody'),c=$('coinHistoryClose');if(!m||!b)return;if(c)c.onclick=closeCoinHistory;m.onclick=e=>{if(e.target===m)closeCoinHistory()};m.classList.add('open');b.innerHTML='Загрузка...';let r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/coins',{cache:'no-store'});if(!r.ok){b.innerHTML='Не удалось загрузить историю';return}let d=await r.json(),u=d.user||{},h=d.history||[];$('coinHistoryTitle').textContent=(u.twitch_display_name||u.twitch_login||'Пользователь')+' · '+Number(d.balance||0)+' монет';b.innerHTML=h.length?h.map(x=>'<div class=\\\"coinHistoryRow\\\"><div>'+fmt(x.created_at)+'</div><div><b>'+esc(coinTypeLabel(x.transaction_type))+'</b>'+(x.note?'<div class=\\\"coinNote\\\">'+esc(x.note)+'</div>':'')+'</div><div class=\\\"'+(Number(x.amount)>=0?'coinPlus':'coinMinus')+'\\\">'+(Number(x.amount)>=0?'+':'')+esc(x.amount)+'</div><div>'+esc(x.balance_after)+' мон.</div></div>').join(''):'История монет пуста'}";
 if(!body.includes('async function setUserLevel')) body=body.replace(marker,helpers+marker);
 body=body.replace("allUsers=s.users||[];$('usersTotal').textContent=s.userStats?.total??allUsers.length;$('usersTrade').textContent=s.userStats?.withTrade??allUsers.filter(u=>u.steam_trade_url_valid).length;$('usersNoTrade').textContent=s.userStats?.withoutTrade??allUsers.filter(u=>!u.steam_trade_url_valid).length;renderUsers();renderOrders(s.orders||[]);timer()", "let ur=await fetch('/api/admin/users',{cache:'no-store'});if(ur.ok){let ud=await ur.json();allUsers=ud.users||[];$('usersTotal').textContent=ud.userStats?.total??allUsers.length;$('usersTrade').textContent=ud.userStats?.withTrade??allUsers.filter(u=>u.steam_trade_url_valid).length;$('usersNoTrade').textContent=ud.userStats?.withoutTrade??allUsers.filter(u=>!u.steam_trade_url_valid).length}else{allUsers=[]}renderUsers();renderOrders(s.orders||[]);timer()");
 const fnStart=body.indexOf('function renderUsers(){');
 if(fnStart>=0){const fnEnd=body.indexOf('function timer(){',fnStart);if(fnEnd>fnStart){const neu="function renderUsers(){let q=String($('userSearch').value||'').toLowerCase(),list=allUsers.filter(u=>!q||String(u.twitch_login||'').toLowerCase().includes(q)||String(u.twitch_display_name||'').toLowerCase().includes(q));$('userRows').innerHTML=list.length?list.map(u=>'<div class=\\\"userRow\\\"><div><b><span class=\\\"userCoinLink\\\" data-coinuser=\\\"'+esc(u.id)+'\\\">'+esc(u.twitch_display_name||u.twitch_login||'—')+'</span></b><div class=\\\"muted\\\">@'+esc(u.twitch_login||'—')+'</div></div><div>'+fmt(u.created_at)+'</div><div>'+(u.steam_trade_url_valid?'Добавлен':'Нет')+'</div><div>'+esc(u.wins_count||0)+'</div><div class=\\\"coinValue\\\">'+esc(u.coin_balance??0)+'</div><div class=\\\"inventoryValue\\\">'+esc(u.inventory_value_coins??0)+'</div><div><div class=\\\"modActions\\\"><b>LVL '+esc(u.level||1)+'</b><input class=\\\"lvlInput\\\" id=\\\"lvl-'+esc(u.id)+'\\\" type=\\\"number\\\" min=\\\"1\\\" max=\\\"50\\\" value=\\\"'+esc(u.level||1)+'\\\"><button class=\\\"lvlSetBtn\\\" data-lvluser=\\\"'+esc(u.id)+'\\\">Установить</button>'+(u.banned?'<button class=\\\"restoreBtn\\\" data-mod=\\\"unban\\\" data-user=\\\"'+esc(u.id)+'\\\">Разбан</button>':u.participation_restricted?'<button class=\\\"restoreBtn\\\" data-mod=\\\"restore\\\" data-user=\\\"'+esc(u.id)+'\\\">Вернуть</button><button class=\\\"banBtn\\\" data-mod=\\\"ban\\\" data-user=\\\"'+esc(u.id)+'\\\">Бан</button>':'<button class=\\\"restrictBtn\\\" data-mod=\\\"restrict\\\" data-user=\\\"'+esc(u.id)+'\\\">Ограничить</button><button class=\\\"banBtn\\\" data-mod=\\\"ban\\\" data-user=\\\"'+esc(u.id)+'\\\">Бан</button>')+'</div><div class=\\\"'+(u.banned?'statusBan':u.participation_restricted?'statusRestrict':'good')+'\\\" style=\\\"font-size:11px;margin-top:5px\\\">'+(u.banned?'Заблокирован':u.participation_restricted?'Не участвует':'Активен')+' · '+esc(u.xp_total||0)+' XP</div></div></div>').join(''):'Нет пользователей';document.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>moderateUser(b.dataset.user,b.dataset.mod));document.querySelectorAll('[data-lvluser]').forEach(b=>b.onclick=()=>setUserLevel(b.dataset.lvluser,document.getElementById('lvl-'+b.dataset.lvluser).value));document.querySelectorAll('[data-coinuser]').forEach(b=>b.onclick=()=>openCoinHistory(b.dataset.coinuser))}";body=body.slice(0,fnStart)+neu+body.slice(fnEnd)}}
 if(!body.includes('id="coinHistoryModal"'))body=body.replace('</body>','<div id="coinHistoryModal" class="coinModal"><div class="coinModalCard"><div class="coinModalHead"><b id="coinHistoryTitle">История монет</b><button id="coinHistoryClose" type="button" class="coinModalClose">Закрыть</button></div><div id="coinHistoryBody"></div></div></div></body>');
 return body;
}