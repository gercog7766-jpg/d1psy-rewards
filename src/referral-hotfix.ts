import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {attachPendingReferral} from './referral-oauth-hotfix.js';
import {referralHtml,referralJs} from './referral-ui.js';
export function installReferralHotfix(){
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(path:any,...handlers:any[]){if(path==='/api/me'&&handlers.length>1)auth=handlers[0];return get.call(this,path,...handlers)};
 p.listen=function(...args:any[]){const app:any=this;if(auth&&!app.locals.__referralsV2){app.locals.__referralsV2=true;
 const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
 app.get('/ref/:code',async(q:any,r:any)=>{r.set('Cache-Control','no-store');const code=String(q.params.code);if(!/^[a-f0-9]{24}$/.test(code))return r.sendStatus(404);const {data,error}=await db.from('rewards_referral_codes').select('code').eq('code',code).maybeSingle();if(error)return r.sendStatus(503);if(!data)return r.sendStatus(404);
 // First valid invitation wins; following another link cannot replace it.
 if(!/^[a-f0-9]{24}$/.test(String(q.cookies?.rewards_ref||'')))r.cookie('rewards_ref',code,{httpOnly:true,secure:String(process.env.APP_URL||'').startsWith('https:'),sameSite:'lax',path:'/',maxAge:30*86400000});
 return r.redirect(q.cookies?.rewards_session||q.cookies?.rewards_device?'/account':'/');});
 app.get('/referrals',auth,(_q:any,r:any)=>r.set('Cache-Control','no-store').send(referralHtml));
 app.get('/referrals.js',(_q:any,r:any)=>r.type('application/javascript').set('Cache-Control','no-cache').send(referralJs));
 app.get('/api/me/referrals',auth,async(q:any,r:any)=>{r.set('Cache-Control','no-store');if(Object.keys(q.query).some(k=>k!=='page'))return r.status(400).json({error:'invalid_request'});const page=q.query.page===undefined?1:Number(q.query.page);if(!Number.isSafeInteger(page)||page<1||page>1000000)return r.status(400).json({error:'invalid_request'});
 const {data:u,error:ue}=await db.from('rewards_users').select('id').eq('twitch_user_id',r.locals.session.twitchUserId).single();if(ue||!u)return r.status(503).json({error:'referrals_unavailable'});
 await attachPendingReferral(q,r,u.id);
 const {data,error}=await db.rpc('rewards_referral_state',{p_user:u.id,p_page:page});if(error||!data)return r.status(503).json({error:'referrals_unavailable'});
 const origin=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;
 r.json({...data,link:origin+'/ref/'+data.code});});
 let working=false;const timer=setInterval(async()=>{if(working)return;working=true;try{const {error}=await db.rpc('rewards_referral_settle',{p_limit:30});if(error)console.error('referral_settlement_failed',error.code)}catch{console.error('referral_settlement_unavailable')}finally{working=false}},5000);timer.unref();
 }return listen.apply(this,args)};
}
