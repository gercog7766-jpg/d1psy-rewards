import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
const SESSION_SECRET=process.env.SESSION_SECRET||'';

type Session={twitchUserId:string;login:string;displayName:string;exp:number};

function readSignedSession(raw:string):Session|null{
  try{
    if(!SESSION_SECRET||!raw)return null;
    const [payload,signature]=raw.split('.');
    if(!payload||!signature)return null;
    const expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
    if(Buffer.byteLength(signature)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
    const session=JSON.parse(Buffer.from(payload,'base64url').toString()) as Session;
    return session.exp>Date.now()?session:null;
  }catch{return null}
}

async function attachReferral(req:any,res:any){
  const ref=String(req.cookies?.rewards_ref||'').trim().toLowerCase();
  if(!ref)return;
  const session=readSignedSession(String(req.cookies?.rewards_session||''));
  if(!session)return;
  try{
    const [{data:me,error:meErr},{data:parent,error:parentErr}]=await Promise.all([
      db.from('rewards_users').select('id,twitch_login').eq('twitch_user_id',session.twitchUserId).maybeSingle(),
      db.from('rewards_users').select('id,twitch_login').ilike('twitch_login',ref).maybeSingle()
    ]);
    if(meErr||parentErr)throw meErr||parentErr;
    if(!me){console.warn('referral_attach_user_missing',session.twitchUserId);return}
    if(!parent){console.warn('referral_attach_referrer_missing',ref);res.clearCookie('rewards_ref',{path:'/'});return}
    if(me.id===parent.id){console.warn('referral_attach_self_blocked',ref);res.clearCookie('rewards_ref',{path:'/'});return}
    const {data:existing,error:existingErr}=await db.from('rewards_referrals').select('id,referrer_user_id').eq('referred_user_id',me.id).maybeSingle();
    if(existingErr)throw existingErr;
    if(existing){res.clearCookie('rewards_ref',{path:'/'});return}
    const {error:insertErr}=await db.from('rewards_referrals').insert({referred_user_id:me.id,referrer_user_id:parent.id});
    if(insertErr){
      if(insertErr.code==='23505'){res.clearCookie('rewards_ref',{path:'/'});return}
      throw insertErr;
    }
    console.log('referral_attached',{referredUserId:me.id,referrerUserId:parent.id});
    res.clearCookie('rewards_ref',{path:'/'});
  }catch(e){console.error('referral_attach_failed',e)}
}

export function installReferralOauthHotfix(){
  const proto:any=(express as any).application;
  const originalGet=proto.get;
  proto.get=function(path:any,...handlers:any[]){
    if(path==='/account'){
      handlers=handlers.map((handler:any)=>async function(req:any,res:any,next:any){
        await attachReferral(req,res);
        return handler(req,res,next);
      });
    }
    return originalGet.call(this,path,...handlers);
  };
}
