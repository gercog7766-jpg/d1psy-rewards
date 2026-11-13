import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { allCoinBalances } from './coin-ledger-paged.js';

export function installAdminUserControlsHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalListen=proto.listen;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state'){
   handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
    const originalJson=res.json.bind(res);
    res.json=async(body:any)=>{if(body&&!body.error){
     const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
     const [{data:users},{data:wins},balances]=await Promise.all([
      db.from('rewards_users').select('id,twitch_user_id,twitch_login,twitch_display_name,steam_trade_url_valid,created_at,participation_restricted,banned').order('created_at',{ascending:false}),
      db.from('rewards_wins').select('user_id,won_at,choice_status,rewards_prizes(sell_price_coins)').order('won_at',{ascending:false}),
      allCoinBalances(db)
     ]);
     const stats=new Map<string,{count:number,last:string|null}>();
     const inventoryValues=new Map<string,number>();
     for(const w of wins||[]){
      const s=stats.get(w.user_id)||{count:0,last:null};s.count++;if(!s.last)s.last=w.won_at;stats.set(w.user_id,s);
      if(w.choice_status==='awaiting_choice'){
       const p:any=Array.isArray((w as any).rewards_prizes)?(w as any).rewards_prizes[0]:(w as any).rewards_prizes;
       inventoryValues.set(w.user_id,(inventoryValues.get(w.user_id)||0)+Number(p?.sell_price_coins||0));
      }
     }
     const list=(users||[]).map((u:any)=>({...u,wins_count:stats.get(u.id)?.count||0,last_win_at:stats.get(u.id)?.last||null,coin_balance:balances.get(u.id)||0,inventory_value_coins:inventoryValues.get(u.id)||0}));
     body={...body,users:list,userStats:{total:list.length,withTrade:list.filter((u:any)=>u.steam_trade_url_valid).length,withoutTrade:list.filter((u:any)=>!u.steam_trade_url_valid).length}}
    }return originalJson(body)};return handler(req,res,next);
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
 body=body.replace('.userHead,.userRow{display:grid;grid-template-columns:1.4fr .9fr .8fr .5fr .9fr;', '.userHead,.userRow{display:grid;grid-template-columns:1.25fr .75fr .7fr .7fr .8fr .45fr .8fr 1.4fr;');
 body=body.replace('.search{width:280px}', '.coinValue{font-weight:750;color:#fcd34d;white-space:nowrap}.inventoryValue{font-weight:750;color:#c4b5fd;white-space:nowrap}.modActions{display:flex;gap:6px;flex-wrap:wrap}.modActions button{padding:6px 9px;font-size:11px}.restrictBtn{background:#92400e}.banBtn{background:#991b1b}.restoreBtn{background:#166534}.statusBan{color:#fca5a5}.statusRestrict{color:#fcd34d}.search{width:280px}');
 body=body.replace('<div>Пользователь</div><div>Регистрация</div><div>Trade URL</div><div>Побед</div><div>Последняя победа</div></div><div id="userRows"', '<div>Пользователь</div><div>Регистрация</div><div>Trade URL</div><div>Монеты</div><div>Инвентарь</div><div>Побед</div><div>Последняя победа</div><div>Управление</div></div><div id="userRows"');
 const fnStart=body.indexOf('function renderUsers(){');
 if(fnStart>=0){const fnEnd=body.indexOf('function timer(){',fnStart);if(fnEnd>fnStart){const neu="function renderUsers(){let q=String($('userSearch').value||'').toLowerCase(),list=allUsers.filter(u=>!q||String(u.twitch_login||'').toLowerCase().includes(q)||String(u.twitch_display_name||'').toLowerCase().includes(q));$('userRows').innerHTML=list.length?list.map(u=>'<div class=\"userRow\"><div><b>'+esc(u.twitch_display_name||u.twitch_login||'—')+'</b><div class=\"muted\">@'+esc(u.twitch_login||'—')+'</div></div><div>'+fmt(u.created_at)+'</div><div>'+(u.steam_trade_url_valid?'Добавлен':'Нет')+'</div><div class=\"coinValue\">'+esc(u.coin_balance||0)+' 🪙</div><div class=\"inventoryValue\">'+esc(u.inventory_value_coins||0)+' 🪙</div><div>'+esc(u.wins_count||0)+'</div><div>'+fmt(u.last_win_at)+'</div><div><div class=\"modActions\">'+(u.banned?'<button class=\"restoreBtn\" data-mod=\"unban\" data-user=\"'+esc(u.id)+'\">Разбан</button>':u.participation_restricted?'<button class=\"restoreBtn\" data-mod=\"restore\" data-user=\"'+esc(u.id)+'\">Вернуть</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>':'<button class=\"restrictBtn\" data-mod=\"restrict\" data-user=\"'+esc(u.id)+'\">Ограничить</button><button class=\"banBtn\" data-mod=\"ban\" data-user=\"'+esc(u.id)+'\">Бан</button>')+'</div><div class=\"'+(u.banned?'statusBan':u.participation_restricted?'statusRestrict':'good')+'\" style=\"font-size:11px;margin-top:5px\">'+(u.banned?'Заблокирован':u.participation_restricted?'Не участвует':'Активен')+'</div></div></div>').join(''):'Нет пользователей';document.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>moderateUser(b.dataset.user,b.dataset.mod))}";body=body.slice(0,fnStart)+neu+body.slice(fnEnd)}}
 body=body.replace('async function connect(){', "async function moderateUser(id,action){var names={restrict:'Ограничить участие пользователя?',restore:'Вернуть пользователю участие?',ban:'Полностью заблокировать пользователя?',unban:'Снять полную блокировку?'};if(!await window.dropsoConfirm(names[action]||'Подтвердить?'))return;var r=await fetch('/api/admin/users/'+encodeURIComponent(id)+'/moderation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:action})});if(!r.ok){window.dropsoNotice('Не удалось изменить статус');return}await load()}async function connect(){");
 return body;
}
