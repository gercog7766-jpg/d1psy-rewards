import {mobileAccountMenu} from './mobile-account-menu.js';
import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {usersHtml,profileHtml,usersJs,presenceJs} from './users-ui.js';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const login=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9_]{1,25}$/i.test(v);
export function installUsers(){
 const proto:any=(express as any).application,get=proto.get,listen=proto.listen;let auth:any;
 proto.get=function(route:any,...handlers:any[]){if(route==='/api/me'&&handlers.length>1)auth=handlers[0];return get.call(this,route,...handlers)};
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){const path=this.req?.path||'';
  if(typeof body==='string'&&/<html\b/i.test(body)&&body.includes('</head>')&&!/^\/(?:api|admin|obs|pwa\/offline|auth)(?:\/|$)/.test(path)){
   if(path==='/account'&&!body.includes('id="usersLink"'))body=body.replace(/(<a\b[^>]*href="\/contracts"[^>]*>[\s\S]*?<\/a>)/,'$1<a id="usersLink" class="shoplink" href="/users">Пользователи</a>');
   if(path==='/account'&&!body.includes('mobileAccountMenuScript'))body=body.replace('</head>',mobileAccountMenu+'</head>');
   if(path!=='/'&&!body.includes('id="sitePresenceScript"'))body=body.replace('</head>','<script id="sitePresenceScript" src="/site-presence.js" defer></script></head>');
  }return send.call(this,body);
 };
 proto.listen=function(...args:any[]){const app:any=this;if(!app.locals.__users&&auth){app.locals.__users=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  function origin(req:any,res:any,next:any){const expected=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==expected))return res.sendStatus(403);if(!req.is('application/json'))return res.sendStatus(415);next()}
  async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'users_unavailable'});return null}return data.id}
  async function rpc(res:any,name:string,params:any){const{data,error}=await db.rpc(name,params);res.set('Cache-Control','no-store');if(error){const reason=['profile_not_found','user_unavailable','device_required','invalid_request'].find(x=>error.message.includes(x));if(!reason)console.error('users_rpc_failed',name,error.code);return res.status(reason==='profile_not_found'?404:reason?409:503).json({error:reason||'users_unavailable'})}if(name==='rewards_user_profile'){
   const {data:target,error:levelError}=await db.from('rewards_users').select('xp_total').eq('twitch_login',data.login).single();
   if(levelError||!target)return res.status(503).json({error:'users_unavailable'});
   const xp=Math.max(0,Number(target.xp_total)||0),level=Math.max(1,Math.floor((Math.sqrt(9+8*xp/75)-3)/2)+1),from=Math.round(37.5*(level-1)*(level+2)),to=Math.round(37.5*level*(level+3));
   data.levelProgress={xp,level,levelXp:xp-from,nextXp:to-from};
  }res.json(data)}
  function page(req:any,res:any){if(req.query.page!==undefined&&(!/^\d{1,6}$/.test(String(req.query.page))||Number(req.query.page)<1)){res.status(400).json({error:'invalid_page'});return null}return Number(req.query.page)||1}
  app.get('/users',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(usersHtml));
  app.get('/users/:login',auth,(req:any,res:any)=>{if(!login(req.params.login))return res.sendStatus(404);res.set('Cache-Control','no-store').send(profileHtml)});
  app.get('/users.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-cache').send(usersJs));
  app.get('/site-presence.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-cache').send(presenceJs));
  app.get('/api/users',auth,async(req:any,res:any)=>{const p=page(req,res);if(!p)return;if(req.query.q!==undefined&&(typeof req.query.q!=='string'||req.query.q.length>60))return res.status(400).json({error:'invalid_query'});const id=await user(res);if(id)await rpc(res,'rewards_users_directory',{p_viewer:id,p_query:req.query.q||'',p_page:p})});
  app.get('/api/users/:login',auth,async(req:any,res:any)=>{if(!login(req.params.login))return res.sendStatus(404);const p=page(req,res);if(!p)return;const id=await user(res);if(id)await rpc(res,'rewards_user_profile',{p_viewer:id,p_login:req.params.login,p_page:p})});
  app.post('/api/me/profile-privacy',auth,origin,async(req:any,res:any)=>{if(typeof req.body?.isPrivate!=='boolean')return res.status(400).json({error:'invalid_request'});const id=await user(res);if(id)await rpc(res,'rewards_profile_privacy',{p_user:id,p_private:req.body.isPrivate})});
  app.post('/api/me/site-presence',auth,origin,async(req:any,res:any)=>{if(!uuid(req.body?.tabId)||typeof req.body?.online!=='boolean')return res.status(400).json({error:'invalid_request'});const id=await user(res);if(id)await rpc(res,'rewards_site_heartbeat',{p_user:id,p_device:res.locals.deviceHash||'',p_tab:req.body.tabId,p_online:req.body.online})});
 }return listen.apply(this,args)};
}
