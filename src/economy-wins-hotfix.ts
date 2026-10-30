import express from 'express';
import { createClient } from '@supabase/supabase-js';

export function installEconomyWinsHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get;
 const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
 proto.get=function(path:any,...handlers:any[]){
  if(path!=='/api/me/wins') return originalGet.call(this,path,...handlers);
  handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
   const originalJson=res.json.bind(res);
   res.json=async(body:any)=>{
    if(Array.isArray(body)&&body.length){
     const ids=body.map((w:any)=>w.id).filter(Boolean);
     const {data}=await db.from('rewards_wins').select('id,choice_status,sold_for_coins,rewards_prizes(sell_price_coins)').in('id',ids);
     const byId=new Map((data||[]).map((x:any)=>[x.id,x]));
     body=body.map((w:any)=>{const extra:any=byId.get(w.id)||{};return {...w,choice_status:extra.choice_status,sold_for_coins:extra.sold_for_coins,rewards_prizes:{...(w.rewards_prizes||{}),sell_price_coins:extra.rewards_prizes?.sell_price_coins??null}}});
    }
    return originalJson(body);
   };
   return handler(req,res,next);
  });
  return originalGet.call(this,path,...handlers);
 };
}
