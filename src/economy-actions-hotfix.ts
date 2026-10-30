import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installEconomyActionsHotfix(){
  const proto:any=(express as any).application;
  const originalPost=proto.post;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const secret=process.env.SESSION_SECRET||'';

  const getUser=async(req:any,res:any)=>{
    try{
      const raw=req.cookies?.rewards_session;
      if(!raw||!secret){res.status(401).json({error:'authentication_required'});return null}
      const [p,s]=raw.split('.');
      if(!p||!s){res.status(401).json({error:'authentication_required'});return null}
      const expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
      if(Buffer.byteLength(s)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))){res.status(401).json({error:'authentication_required'});return null}
      const session=JSON.parse(Buffer.from(p,'base64url').toString());
      if(session.exp<=Date.now()){res.status(401).json({error:'authentication_required'});return null}
      const {data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',session.twitchUserId).single();
      if(error||!data){res.status(404).json({error:'user_not_found'});return null}
      return data;
    }catch{res.status(401).json({error:'authentication_required'});return null}
  };

  // Intercept registration of the first POST route and install the two economy
  // actions before any legacy routes. Do not use app.locals here: Express itself
  // stores settings in app.locals, so that flag could be set before route setup.
  let installed=false;
  proto.post=function(path:any,...handlers:any[]){
    const app:any=this;
    if(!installed){
      installed=true;
      originalPost.call(app,'/api/me/wins/:id/claim',async(req:any,res:any)=>{
        const u=await getUser(req,res); if(!u)return;
        const {data,error}=await db.rpc('rewards_claim_win',{p_win_id:req.params.id,p_user_id:u.id});
        if(error)return res.status(409).json({error:error.message});
        return res.json({ok:true,win:data});
      });
      originalPost.call(app,'/api/me/wins/:id/sell',async(req:any,res:any)=>{
        const u=await getUser(req,res); if(!u)return;
        const {data,error}=await db.rpc('rewards_sell_win',{p_win_id:req.params.id,p_user_id:u.id});
        if(error)return res.status(409).json({error:error.message});
        return res.json({ok:true,balance:data,currency:'Монета'});
      });
    }
    return originalPost.call(app,path,...handlers);
  };
}
