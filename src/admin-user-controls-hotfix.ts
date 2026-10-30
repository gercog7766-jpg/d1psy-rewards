import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installAdminUserControlsHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalListen=proto.listen;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state'){
   handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
    const originalJson=res.json.bind(res);
    res.json=async(body:any)=>{if(body&&!body.error){const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});const [{data:users},{data:wins}]=await Promise.all([db.from('rewards_users').select('id,twitch_user_id,twitch_login,twitch_display_name,steam_trade_url_valid,created_at,participation_restricted,banned').order('created_at',{ascending:false}),db.from('rewards_wins').select('user_id,won_at').order('won_at',{ascending:false})]);const stats=new Map<string,{count:number,last:string|null}>();for(const w of wins||[]){const s=stats.get(w.user_id)||{count:0,last:null};s.count++;if(!s.last)s.last=w.won_at;stats.set(w.user_id,s)}const list=(users||[]).map((u:any)=>({...u,wins_count:stats.get(u.id)?.count||0,last_win_at:stats.get(u.id)?.last||null}));body={...body,users:list,userStats:{total:list.length,withTrade:list.filter((u:any)=>u.steam_trade_url_valid).length,withoutTrade:list.filter((u:any)=>!u.steam_trade_url_valid).length}}}return originalJson(body)};return handler(req,res,next);
   });
  }
  if(path==='/admin'){
   handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){const send=res.send.bind(res);res.send=(body:any)=>send(typeof body==='string'?enhanceAdmin(body):body);return handler(req,res,next)});
  }
  return originalGet.call(this,path,...handlers);
 };
 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__adminUserControlsInstalled){
   app.locals.__adminUserControlsInstalled=true;
   const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
   app.post('/api/admin/users/:id/moderation',async(req:any,res:any)=>{const action=String(req.body?.action||''),patch:any={updated_at:new Date().toISOString()};if(action==='restrict'){patch.participation_restricted=true;patch.banned=false}else if(action==='restore'){patch.participation_restricted=false}else if(action==='ban'){patch.banned=true;patch.participation_restricted=true}else if(action==='unban'){patch.banned=false;patch.participation_restricted=false}else return res.status(400).json({error:'invalid_action'});const {data,error}=await db.from('rewards_users').update(patch).eq('id',req.params.id).select('id,participation_restricted,banned').single();if(error)return res.status(400).json({error:error.message});res.json({ok:true,user:data})});
  }
  return originalListen.apply(this,args);
 };
}

function enhanceAdmin(body:string){
 body=body.replace('.userHead,.userRow{display:grid;grid-template-columns:1.5fr 1fr 1fr .7fr 1fr;', '.userHead,.userRow{display:grid;grid-template-columns:1.4fr .9fr .8fr .5fr .9fr 1.5fr;');
 body=body.replace('.search{width:280px;', '.modActions{display:flex;gap:6px;flex-wrap:wrap}.modActions button{padding:6px 9px;font-size:11px}.restrictBtn{background:#92400e}.banBtn{background:#991b1b}.restoreBtn{background:#166534}.statusBan{color:#fca5a5}.statusRestrict{color:#fcd34d}.search{width:280px;');
 body=body.replace('<div>Последняя победа</div></div><div id="userRows"', '<div>Последняя победа</div><div>Управление</div></div><div id="userRows"');
 const old="<div>'+fmt(u.last_win_at)+'</div></div>').join('')";
 const neu="<div>'+fmt(u.last_win_at)+'</div><div><div class=\"modActions\">'+(u.banned?'<button class=\"restoreBtn\" data-mod=\"unban\" data-user=\"'+esc(u.id)+'\">Разбан</button>':u.participation_restricted?'<button class=\"restoreBtn\" data-mod=\"restore\" data-user=\"'+esc(u.id)+'\">Вернуть</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>':'<button class=\"restrictBtn\" data-mod=\"restrict\" data-user=\"'+esc(u.id)+'\">Ограничить</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>')+'</div><div class=\"'+(u.banned?'statusBan':u.participation_restricted?'statusRestrict':'good')+'\" style=\"font-size:11px;margin-top:5px\">'+(u.banned?'Заблокирован':u.participation_restricted?'Не участвует':'Активен')+'</div></div></div>').join('');document.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>moderateUser(b.dataset.user,b.dataset.mod))";
 body=body.replace(old,neu);
 body=body.replace('async function connect(){', "async function moderateUser(id,action){var names={restrict:'Ограничить участие пользователя?',restore:'Вернуть пользователю участие?',ban:'Полностью заблокировать пользователя?',unban:'Снять полную блокировку?'};if(!confirm(names[action]||'Подтвердить?'))return;var r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/moderation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:action})});if(!r.ok){alert('Не удалось изменить статус');return}await load()}async function connect(){");
 return body;
}
