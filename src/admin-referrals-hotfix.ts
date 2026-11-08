import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {addAdminReferrals,adminReferralsJs} from './admin-referrals-ui.js';
const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
export function installAdminReferralsHotfix(){
 const response:any=(express as any).response,send=response.send;response.send=function(body:any){if(typeof body==='string')body=addAdminReferrals(body);return send.call(this,body)};
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(path:any,...handlers:any[]){if(path==='/api/admin/state'&&handlers.length>1)auth=handlers[0];return get.call(this,path,...handlers)};
 p.listen=function(...args:any[]){const app:any=this;if(auth&&!app.locals.__adminReferrals){app.locals.__adminReferrals=true;
 app.get('/admin/referrals.js',(_q:any,r:any)=>r.type('application/javascript').set('Cache-Control','no-cache').send(adminReferralsJs));
 app.get('/api/admin/referrals',auth,async(q:any,r:any)=>{r.set('Cache-Control','no-store');const page=q.query.page===undefined?1:Number(q.query.page),search=typeof q.query.q==='string'?q.query.q.trim():'';if(Object.keys(q.query).some(k=>!['page','q'].includes(k))||!Number.isSafeInteger(page)||page<1||page>1000000||search.length>80)return r.status(400).json({error:'invalid_request'});const {data,error}=await db.rpc('rewards_referral_admin',{p_query:search,p_page:page});if(error||!data)return r.status(503).json({error:'referrals_unavailable'});r.json(data)});
 }return listen.apply(this,args)};
}
