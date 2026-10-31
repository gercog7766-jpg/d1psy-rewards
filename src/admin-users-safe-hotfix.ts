import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
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
    const [{data:users,error:uErr},{data:wins,error:wErr}]=await Promise.all([
     db.from('rewards_users').select('id,twitch_user_id,twitch_login,twitch_display_name,steam_trade_url_valid,created_at,participation_restricted,banned,xp_total').order('created_at',{ascending:false}),
     db.from('rewards_wins').select('user_id,won_at').order('won_at',{ascending:false})
    ]);
    if(uErr||wErr)return res.status(500).json({error:'users_load_failed'});
    const stats=new Map<string,{count:number,last:string|null}>();
    for(const w of wins||[]){const x=stats.get(w.user_id)||{count:0,last:null};x.count++;if(!x.last)x.last=w.won_at;stats.set(w.user_id,x)}
    const list=(users||[]).map((u:any)=>({...u,level:levelFromXp(Number(u.xp_total||0)),wins_count:stats.get(u.id)?.count||0,last_win_at:stats.get(u.id)?.last||null}));
    res.json({users:list,userStats:{total:list.length,withTrade:list.filter((u:any)=>u.steam_trade_url_valid).length,withoutTrade:list.filter((u:any)=>!u.steam_trade_url_valid).length}});
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
 body=body.replace('.userHead,.userRow{display:grid;grid-template-columns:1.4fr .9fr .8fr .5fr .9fr;', '.userHead,.userRow{display:grid;grid-template-columns:1.25fr .75fr .65fr .4fr .75fr 1.7fr;');
 body=body.replace('.search{width:280px}', '.modActions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.modActions button{padding:6px 9px;font-size:11px}.lvlInput{width:58px;padding:6px 7px;font-size:11px}.lvlSetBtn{background:#6d28d9}.restrictBtn{background:#92400e}.banBtn{background:#991b1b}.restoreBtn{background:#166534}.statusBan{color:#fca5a5}.statusRestrict{color:#fcd34d}.search{width:280px}');
 body=body.replace('<div>Последняя победа</div></div><div id="userRows">', '<div>Последняя победа</div><div>Управление / LVL</div></div><div id="userRows">');
 const marker="async function markSent(id){";
 const helpers="async function setUserLevel(id,level){level=Number(level);if(!Number.isInteger(level)||level<1||level>50){alert('Укажи LVL от 1 до 50');return}let r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/level',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({level})});if(!r.ok){alert('Не удалось изменить LVL');return}await load()}async function moderateUser(id,action){let labels={restrict:'Ограничить участие пользователя?',restore:'Вернуть пользователю участие?',ban:'Заблокировать пользователя?',unban:'Снять блокировку?'};if(!confirm(labels[action]||'Подтвердить?'))return;let r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/moderation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});if(!r.ok){alert('Не удалось изменить статус');return}await load()}";
 if(!body.includes('async function setUserLevel')) body=body.replace(marker,helpers+marker);
 body=body.replace("allUsers=s.users||[];$('usersTotal').textContent=s.userStats?.total??allUsers.length;$('usersTrade').textContent=s.userStats?.withTrade??allUsers.filter(u=>u.steam_trade_url_valid).length;$('usersNoTrade').textContent=s.userStats?.withoutTrade??allUsers.filter(u=>!u.steam_trade_url_valid).length;renderUsers();renderOrders(s.orders||[]);timer()", "let ur=await fetch('/api/admin/users',{cache:'no-store'});if(ur.ok){let ud=await ur.json();allUsers=ud.users||[];$('usersTotal').textContent=ud.userStats?.total??allUsers.length;$('usersTrade').textContent=ud.userStats?.withTrade??allUsers.filter(u=>u.steam_trade_url_valid).length;$('usersNoTrade').textContent=ud.userStats?.withoutTrade??allUsers.filter(u=>!u.steam_trade_url_valid).length}else{allUsers=[]}renderUsers();renderOrders(s.orders||[]);timer()");
 const fnStart=body.indexOf('function renderUsers(){');
 if(fnStart>=0){const fnEnd=body.indexOf('function timer(){',fnStart);if(fnEnd>fnStart){const neu="function renderUsers(){let q=String($('userSearch').value||'').toLowerCase(),list=allUsers.filter(u=>!q||String(u.twitch_login||'').toLowerCase().includes(q)||String(u.twitch_display_name||'').toLowerCase().includes(q));$('userRows').innerHTML=list.length?list.map(u=>'<div class=\"userRow\"><div><b>'+esc(u.twitch_display_name||u.twitch_login||'—')+'</b><div class=\"muted\">@'+esc(u.twitch_login||'—')+'</div></div><div>'+fmt(u.created_at)+'</div><div>'+(u.steam_trade_url_valid?'Добавлен':'Нет')+'</div><div>'+esc(u.wins_count||0)+'</div><div>'+fmt(u.last_win_at)+'</div><div><div class=\"modActions\"><b>LVL '+esc(u.level||1)+'</b><input class=\"lvlInput\" id=\"lvl-'+esc(u.id)+'\" type=\"number\" min=\"1\" max=\"50\" value=\"'+esc(u.level||1)+'\"><button class=\"lvlSetBtn\" data-lvluser=\"'+esc(u.id)+'\">Установить</button>'+(u.banned?'<button class=\"restoreBtn\" data-mod=\"unban\" data-user=\"'+esc(u.id)+'\">Разбан</button>':u.participation_restricted?'<button class=\"restoreBtn\" data-mod=\"restore\" data-user=\"'+esc(u.id)+'\">Вернуть</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>':'<button class=\"restrictBtn\" data-mod=\"restrict\" data-user=\"'+esc(u.id)+'\">Ограничить</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>')+'</div><div class=\"'+(u.banned?'statusBan':u.participation_restricted?'statusRestrict':'good')+'\" style=\"font-size:11px;margin-top:5px\">'+(u.banned?'Заблокирован':u.participation_restricted?'Не участвует':'Активен')+' · '+esc(u.xp_total||0)+' XP</div></div></div>').join(''):'Нет пользователей';document.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>moderateUser(b.dataset.user,b.dataset.mod));document.querySelectorAll('[data-lvluser]').forEach(b=>b.onclick=()=>setUserLevel(b.dataset.lvluser,document.getElementById('lvl-'+b.dataset.lvluser).value))}";body=body.slice(0,fnStart)+neu+body.slice(fnEnd)}}
 return body;
}