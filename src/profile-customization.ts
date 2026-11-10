import type {Express,RequestHandler} from 'express';
import {createClient} from '@supabase/supabase-js';
import {customizationHtml,customizationJs,titlesHtml} from './profile-customization-ui.js';
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export async function attachProfileStyles(db:any,users:any[]){if(!users.length)return;const {data,error}=await db.rpc('rewards_profile_styles',{p_logins:users.map(u=>u.login)});if(error)throw Error('profile_styles_unavailable');const styles=new Map((Array.isArray(data)?data:[]).map((s:any)=>[s.login,{bio:s.bio,frame:s.frame,background:s.background,title:s.title}]));for(const u of users)u.style=styles.get(u.login)||{};}
export function installProfileCustomization(app:Express,userAuth:RequestHandler,adminAuth:RequestHandler,client?:any){
 const db=client||createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
 const privateGet:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private,no-store');n()};
 const origin:RequestHandler=(q,r,n)=>{r.set('Cache-Control','private,no-store');const expected=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;if(q.get('sec-fetch-site')==='cross-site'||q.get('origin')&&q.get('origin')!==expected)return void r.sendStatus(403);if(!q.is('application/json'))return void r.sendStatus(415);n()};
 const counts=new Map<string,{n:number,until:number}>();const throttle:RequestHandler=(_q,r,n)=>{const actor=r.locals.session.twitchUserId,now=Date.now(),c=counts.get(actor);if(c&&c.until>now&&c.n>=60)return void r.status(429).json({error:'rate_limited'});counts.set(actor,{n:c&&c.until>now?c.n+1:1,until:c&&c.until>now?c.until:now+60000});if(counts.size>2000)for(const[k,v]of counts)if(v.until<now)counts.delete(k);n()};
 async function rpc(r:any,action:string,body:any={}){const {data,error}=await db.rpc('rewards_profile_customization',{p_actor:r.locals.session.twitchUserId,p_action:action,p_body:body});if(error){const reason=['owner_required','user_unavailable','insufficient_coins','request_conflict','invalid_title','invalid_item','item_not_owned','invalid_request'].find(x=>String(error.message).includes(x));if(!reason)console.error('profile_customization_failed',error.code);r.status(reason==='owner_required'||reason==='user_unavailable'?403:reason?409:503).json({error:reason||'profile_unavailable'});return}r.json(data)}
 app.get('/profile/customize',privateGet,userAuth,(_q,r)=>r.send(customizationHtml));
 app.get('/admin/profile-titles',privateGet,adminAuth,(_q,r)=>r.send(titlesHtml));
 app.get('/profile-customization.js',(_q,r)=>r.type('application/javascript').set('Cache-Control','no-cache').send(customizationJs));
 app.get('/api/me/profile-customization',privateGet,userAuth,async(_q,r)=>{await rpc(r,'state')});
 app.get('/api/admin/profile-titles',privateGet,adminAuth,async(q,r)=>{if(q.query.q!==undefined&&(typeof q.query.q!=='string'||q.query.q.length>60)||q.query.page!==undefined&&(typeof q.query.page!=='string'||!/^\d{1,6}$/.test(q.query.page)||Number(q.query.page)<1))return void r.status(400).json({error:'invalid_request'});await rpc(r,'titles',{query:q.query.q||'',page:Number(q.query.page)||1})});
 for(const admin of [false,true])app.post('/api/'+(admin?'admin/profile-titles':'me/profile-customization')+'/:action',admin?adminAuth:userAuth,origin,throttle,async(q,r)=>{
  const b=q.body,a=String(q.params.action),keys:Record<string,string[]|undefined>=admin?{grant:['userId','title'],revoke:['userId']}:{buy:['itemId','requestId'],save:['bio','frame','background','titleVisible']};const expected=keys[a];
  if(!expected||!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).length!==expected.length||Object.keys(b).some(k=>!expected.includes(k)))return void r.status(400).json({error:'invalid_request'});
  if(a==='buy'&&(!uuid(b.requestId)||typeof b.itemId!=='string'||! /^[a-z]{1,20}$/.test(b.itemId))||a==='save'&&(typeof b.bio!=='string'||Array.from(b.bio).length>240||typeof b.frame!=='string'||typeof b.background!=='string'||b.frame.length>20||b.background.length>20||typeof b.titleVisible!=='boolean')||admin&&(!uuid(b.userId)||a==='grant'&&(typeof b.title!=='string'||!b.title.trim()||Array.from(b.title).length>40)))return void r.status(400).json({error:'invalid_request'});
  await rpc(r,a,b);
 });
 // Installed before the dashboard route so the link is included in its final HTML.
 app.use((q,r,next)=>{const send=r.send;r.send=function(body:any){if(typeof body==='string'&&q.path==='/admin'&&!body.includes('id="profileTitlesLink"'))body=body.replace('<div class="tabs">','<div class="tabs"><a id="profileTitlesLink" href="/admin/profile-titles" style="padding:10px 14px;border-radius:10px;background:#30243f;color:#fff;text-decoration:none">Титулы</a>');return send.call(this,body)};next()});
}
