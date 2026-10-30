import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installEconomyWinsHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get;
 const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
 proto.get=function(path:any,...handlers:any[]){
  if(path!=='/api/me/wins') return originalGet.call(this,path,...handlers);
  // Keep the original authentication middleware, but replace the legacy wins query
  // so choice_status and sale price are returned directly and cannot be lost by response wrapping.
  const auth=handlers[0];
  const completeWins=async(_req:any,res:any)=>{
   const s=res.locals.session;
   if(!s?.twitchUserId) return res.status(401).json({error:'authentication_required'});
   const {data:u,error:uErr}=await db.from('rewards_users').select('id').eq('twitch_user_id',s.twitchUserId).single();
   if(uErr||!u) return res.json([]);
   const {data,error}=await db.from('rewards_wins')
    .select('id,won_at,delivery_status,delivered_at,choice_status,choice_at,sold_for_coins,rewards_prizes(name,image_url,sell_price_coins)')
    .eq('user_id',u.id)
    .order('won_at',{ascending:false});
   if(error) return res.status(500).json({error:error.message});
   return res.json(data||[]);
  };
  return originalGet.call(this,path,auth,completeWins);
 };
}
