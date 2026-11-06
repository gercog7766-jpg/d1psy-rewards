import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {liveHtml,liveJs} from './live-ui.js';
import {validLiveUpdate} from './live-markets.js';
export function installLive(){
 const proto:any=(express as any).application,get=proto.get,listen=proto.listen,response:any=(express as any).response,send=response.send;let userAuth:any,adminAuth:any;
 proto.get=function(path:any,...handlers:any[]){if(path==='/api/me'&&handlers.length>1)userAuth=handlers[0];if(path==='/api/admin/state'&&handlers.length>1)adminAuth=handlers[0];return get.call(this,path,...handlers)};
 response.send=function(body:any){const path=this.req?.path;if(typeof body==='string'&&body.includes('</html>')){
  if(path==='/account'&&!body.includes('id="liveLink"'))body=body.replace(/(<a\b[^>]*id="usersLink"[^>]*>[\s\S]*?<\/a>)/,'$1<a id="liveLink" class="shoplink" href="/live">Live</a>');
  if(path==='/admin'&&!body.includes('id="liveAdminLink"'))body=body.replace('<div class="tabs">','<div class="tabs"><a id="liveAdminLink" href="/admin/live" style="border-radius:10px;padding:10px 14px;background:#30243f;color:#fff;text-decoration:none;font-weight:650">Live</a>');
 }return send.call(this,body)};
 proto.listen=function(...args:any[]){const app:any=this;if(!app.locals.__live&&userAuth&&adminAuth){app.locals.__live=true;const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
 const noStore=(_req:any,res:any,next:any)=>{res.set('Cache-Control','no-store');next()};
 const origin=(req:any,res:any,next:any)=>{const expected=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==expected))return res.sendStatus(403);if(!req.is('application/json'))return res.sendStatus(415);next()};
 const state=async(_req:any,res:any)=>{const {data,error}=await db.from('rewards_live_test_markets').select('key,enabled,result,version').order('key');if(error||data?.length!==6)return res.status(503).json({error:'live_unavailable'});res.json({markets:data})};
 app.get('/live',noStore,userAuth,(_req:any,res:any)=>res.send(liveHtml()));app.get('/admin/live',noStore,adminAuth,(_req:any,res:any)=>res.send(liveHtml(true)));app.get('/live.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-cache').send(liveJs));
 app.get('/api/me/live',noStore,userAuth,state);app.get('/api/admin/live',noStore,adminAuth,state);
 app.post('/api/admin/live/:key',noStore,adminAuth,origin,async(req:any,res:any)=>{const key=String(req.params.key);if(!validLiveUpdate(key,req.body))return res.status(400).json({error:'invalid_live_update'});const {data,error}=await db.from('rewards_live_test_markets').update({enabled:req.body.enabled,result:req.body.result,version:req.body.version+1,updated_at:new Date().toISOString()}).eq('key',key).eq('version',req.body.version).select('key,enabled,result,version').maybeSingle();if(error)return res.status(503).json({error:'live_save_failed'});if(!data)return res.status(409).json({error:'live_changed'});res.json(data)});
 }return listen.apply(this,args)};
}
