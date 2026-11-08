import express from 'express';
import {createClient} from '@supabase/supabase-js';
const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
/** Run only AFTER the existing session/device middleware has authenticated the viewer. */
export async function attachPendingReferral(req:any,res:any,userId?:string){
 const code=String(req.cookies?.rewards_ref||'');if(!code)return;
 const clear=()=>{res.clearCookie('rewards_ref',{path:'/'});delete req.cookies.rewards_ref};
 if(!/^[a-f0-9]{24}$/.test(code)){clear();return}
 const actor=res.locals.session?.twitchUserId;if(!actor)return;
 try{
  let id=userId;if(!id){const {data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',actor).single();if(error||!data)throw Error('user_lookup_failed');id=data.id}
  const {data,error}=await db.rpc('rewards_referral_bind',{p_user:id,p_code:code});
  if(error||!data?.status)throw Error('bind_unavailable');
  clear();
 }catch{console.error('referral_bind_unavailable');/* Keep attribution cookie for a safe retry. */}
}
export function installReferralOauthHotfix(){
 const p:any=(express as any).application,get=p.get;
 p.get=function(path:any,...handlers:any[]){if(path==='/api/me'&&handlers.length>1){const last=handlers.length-1,original=handlers[last];handlers[last]=async(req:any,res:any,next:any)=>{await attachPendingReferral(req,res);return original(req,res,next)}}return get.call(this,path,...handlers)};
}
