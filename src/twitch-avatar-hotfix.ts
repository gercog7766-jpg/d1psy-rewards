import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

export function installTwitchAvatarHotfix(){
  const proto:any=(express as any).application;
  const get=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/auth/twitch/callback'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        const originalFetch=globalThis.fetch;
        globalThis.fetch=(async(input:any,init?:any)=>{
          const response=await originalFetch(input,init);
          try{
            const url=typeof input==='string'?input:String(input?.url||'');
            if(url==='https://api.twitch.tv/helix/users'&&response.ok){
              const clone=response.clone();
              const payload:any=await clone.json();
              const user=payload?.data?.[0];
              if(user?.id&&user?.profile_image_url){
                void db.from('rewards_users').update({twitch_avatar_url:String(user.profile_image_url),updated_at:new Date().toISOString()}).eq('twitch_user_id',String(user.id));
              }
            }
          }catch(e){console.error('twitch avatar capture failed',e)}
          return response;
        }) as typeof fetch;
        try{return await handler(req,res,next)}finally{globalThis.fetch=originalFetch}
      });
    }
    return get.call(this,path,...handlers);
  };
}
