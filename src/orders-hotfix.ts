import express from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL=process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co';
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'not-configured';
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false}});

export function installOrdersHotfix(){
 const proto:any=(express as any).application;
 const originalGet=proto.get, originalPost=proto.post;
 proto.get=function(path:any,...handlers:any[]){
  if(path==='/api/admin/state' && handlers.length){
   const last=handlers.length-1, originalHandler=handlers[last];
   handlers[last]=async function(req:any,res:any,next:any){
    const originalJson=res.json.bind(res);
    res.json=(payload:any)=>{
     if(!payload||typeof payload!=='object')return originalJson(payload);
     return (async()=>{
      try{
       const [{data:orders,error:oErr},{data:users,error:uErr}]=await Promise.all([
        db.from('rewards_orders').select('id,user_id,source_type,win_id,shop_item_id,item_name,image_url,price_coins,status,created_at,sent_at').order('created_at',{ascending:false}).limit(200),
        db.from('rewards_users').select('id,twitch_login,twitch_display_name,steam_trade_url,steam_trade_url_valid')
       ]);
       if(oErr)throw oErr;if(uErr)throw uErr;
       const byUser=new Map((users||[]).map((u:any)=>[u.id,u]));
       payload.orders=(orders||[]).map((o:any)=>({...o,rewards_users:byUser.get(o.user_id)||null}));
      }catch(e){console.error('orders_state_failed',e);payload.orders=[]}
      return originalJson(payload);
     })();
    };
    return originalHandler(req,res,next);
   };
  }
  return originalGet.call(this,path,...handlers);
 };
 proto.post=function(path:any,...handlers:any[]){
  if(path==='/api/admin/orders/:id/sent'){
   return originalPost.call(this,path,...handlers);
  }
  if(path==='/api/admin/wins/:id/delivered'){
   const auth=handlers[0];
   return originalPost.call(this,'/api/admin/orders/:id/sent',auth,async(req:any,res:any)=>{
    const {data:order,error:oErr}=await db.from('rewards_orders').select('id,win_id,status').eq('id',req.params.id).maybeSingle();
    if(oErr)return res.status(500).json({error:oErr.message});
    if(!order)return res.status(404).json({error:'order_not_found'});
    if(order.status==='sent')return res.json({ok:true});
    const now=new Date().toISOString();
    const {error}=await db.from('rewards_orders').update({status:'sent',sent_at:now}).eq('id',order.id).eq('status','pending');
    if(error)return res.status(500).json({error:error.message});
    if(order.win_id){const {error:wErr}=await db.from('rewards_wins').update({delivery_status:'received',delivered_at:now}).eq('id',order.win_id);if(wErr)return res.status(500).json({error:wErr.message})}
    return res.json({ok:true});
   });
  }
  return originalPost.call(this,path,...handlers);
 };
}
