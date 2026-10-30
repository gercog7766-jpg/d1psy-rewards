import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installAdminUserControlsHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalListen=proto.listen;

 // Enrich the existing admin state with users and their moderation status.
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state'){
   handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
    const originalJson=res.json.bind(res);
    res.json=async(body:any)=>{
     if(body && !body.error){
      const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
      const [{data:users},{data:wins}]=await Promise.all([
       db.from('rewards_users').select('id,twitch_user_id,twitch_login,twitch_display_name,steam_trade_url_valid,created_at,participation_restricted,banned').order('created_at',{ascending:false}),
       db.from('rewards_wins').select('user_id,won_at').order('won_at',{ascending:false})
      ]);
      const stats=new Map<string,{count:number,last:string|null}>();
      for(const w of wins||[]){const s=stats.get(w.user_id)||{count:0,last:null};s.count++;if(!s.last)s.last=w.won_at;stats.set(w.user_id,s)}
      const list=(users||[]).map((u:any)=>({...u,wins_count:stats.get(u.id)?.count||0,last_win_at:stats.get(u.id)?.last||null}));
      body={...body,users:list,userStats:{total:list.length,withTrade:list.filter((u:any)=>u.steam_trade_url_valid).length,withoutTrade:list.filter((u:any)=>!u.steam_trade_url_valid).length}};
     }
     return originalJson(body);
    };
    return handler(req,res,next);
   });
  }
  return originalGet.call(this,path,...handlers);
 };

 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__adminUserControlsInstalled){
   app.locals.__adminUserControlsInstalled=true;
   const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
   const requireAdmin=async(req:any,res:any,next:any)=>{const id=req.session?.twitchUserId||req.user?.twitchUserId||req.cookies?.twitch_user_id; if(!id)return res.status(401).json({error:'authentication_required'}); const {data}=await db.from('rewards_admins').select('twitch_user_id').eq('twitch_user_id',id).maybeSingle(); if(!data)return res.status(403).json({error:'admin_required'}); next()};
   app.post('/api/admin/users/:id/moderation',requireAdmin,async(req:any,res:any)=>{
    const action=String(req.body?.action||'');
    const patch:any={updated_at:new Date().toISOString()};
    if(action==='restrict'){patch.participation_restricted=true;patch.banned=false}
    else if(action==='restore'){patch.participation_restricted=false}
    else if(action==='ban'){patch.banned=true;patch.participation_restricted=true}
    else if(action==='unban'){patch.banned=false;patch.participation_restricted=false}
    else return res.status(400).json({error:'invalid_action'});
    const {data,error}=await db.from('rewards_users').update(patch).eq('id',req.params.id).select('id,participation_restricted,banned').single();
    if(error)return res.status(400).json({error:error.message});
    res.json({ok:true,user:data});
   });
  }
  return originalListen.apply(this,args);
 };
}
