import express from 'express';
import { createClient } from '@supabase/supabase-js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

export function installReferralOauthHotfix(){
 const response:any=(express as any).response;const originalRedirect=response.redirect;
 response.redirect=function(...args:any[]){try{const req:any=this.req;const location=String(args.length>1?args[1]:args[0]);const ref=String(req?.cookies?.rewards_ref||'').trim().toLowerCase();const sessionCookie=this.getHeader?.('Set-Cookie');if(location==='/account'&&ref&&sessionCookie){const cookies=Array.isArray(sessionCookie)?sessionCookie:[sessionCookie];const sessionLine=cookies.map(String).find((x:string)=>x.startsWith('rewards_session='));if(sessionLine){const raw=sessionLine.split(';')[0].slice('rewards_session='.length);const p=raw.split('.')[0];const s=JSON.parse(Buffer.from(p,'base64url').toString());setImmediate(async()=>{try{const [{data:me},{data:parent}]=await Promise.all([db.from('rewards_users').select('id').eq('twitch_user_id',s.twitchUserId).maybeSingle(),db.from('rewards_users').select('id').eq('twitch_login',ref).maybeSingle()]);if(me&&parent&&me.id!==parent.id)await db.from('rewards_referrals').insert({referred_user_id:me.id,referrer_user_id:parent.id})}catch{}});this.clearCookie?.('rewards_ref')}}}catch{}return originalRedirect.apply(this,args)};
}
