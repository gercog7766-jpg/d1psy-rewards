import express from 'express';
import {ServerResponse} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {pwaManifest,pwaHead,pwaPanel,pwaJs,pwaSw,offlineHtml} from './pwa-assets.js';
import {pwaIcons} from './pwa-icons.js';
export function validPushSubscription(body:any){
 try{
  const u=new URL(body.endpoint);
  const host=u.hostname;
  const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
  return allowed&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&body.endpoint.length<=4096&&/^[A-Za-z0-9_-]{87}$/.test(body.keys?.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(body.keys?.auth)&&Buffer.from(body.keys.p256dh,'base64url')[0]===4;
 }catch{return false}
}
function enhanceHtml(body:any,path:string){
 if(typeof body!=='string'||!/<html\b/i.test(body)||!body.includes('</head>')||/^\/(api(?:\/|$)|admin|obs|pwa\/offline)/.test(path)||/\.js$/.test(path)||body.includes('href="/manifest.webmanifest"'))return body;
 body=body.replace('</head>',pwaHead+'</head>');
 if(path==='/account'&&!body.includes('id="d1PwaPanel"')){
  if(body.includes('<section id="seasonAccountHero"'))body=body.replace('<section id="seasonAccountHero"',pwaPanel+'<section id="seasonAccountHero"');
  else body=body.replace('</main>',pwaPanel+'</main>');
 }
 return body;
}
export function installPwa(){
 const proto:any=(express as any).application,get=proto.get,listen=proto.listen;let auth:any;
 proto.get=function(route:any,...handlers:any[]){if(route==='/api/me'&&handlers.length>1)auth=handlers[0];return get.call(this,route,...handlers)};
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){return send.call(this,enhanceHtml(body,this.req?.path||''))};
 // The landing page is emitted directly by the existing raw HTTP handler.
 const end=ServerResponse.prototype.end;
 (ServerResponse.prototype as any).end=function(chunk:any,...rest:any[]){const route=String(this.req?.url||'').split('?')[0];return (end as any).call(this,enhanceHtml(chunk,route),...rest)};
 proto.listen=function(...args:any[]){const app:any=this;
  if(!app.locals.__pwa&&auth){app.locals.__pwa=true;
   const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
   app.get('/manifest.webmanifest',(_req:any,res:any)=>res.type('application/manifest+json').set('Cache-Control','no-cache').json(pwaManifest));
   app.get('/sw.js',(_req:any,res:any)=>res.type('application/javascript').set({'Cache-Control':'no-cache','Service-Worker-Allowed':'/'}).send(pwaSw));
   app.get('/pwa.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-cache').send(pwaJs));
   app.get('/pwa/offline',(_req:any,res:any)=>res.type('html').set('Cache-Control','public,max-age=3600').send(offlineHtml));
   app.get('/pwa/icon/:name', (req:any,res:any)=>{const icon=pwaIcons[String(req.params.name).replace(/\.png$/,'')];if(!icon)return res.sendStatus(404);res.type('png').set('Cache-Control','public,max-age=86400').send(Buffer.from(icon,'base64'))});
   app.get('/app',(req:any,res:any)=>res.set('Cache-Control','no-store').redirect(req.cookies?.rewards_session?'/account':'/'));
   async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'push_unavailable'});return null}return data.id}
   function origin(req:any,res:any,next:any){const expected=process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000);if((req.get('origin')&&req.get('origin')!==new URL(expected).origin)||req.get('sec-fetch-site')==='cross-site')return res.sendStatus(403);if(!req.is('application/json'))return res.sendStatus(415);next()}
   app.get('/api/me/push',auth,async(_req:any,res:any)=>{res.set('Cache-Control','no-store');const id=await user(res);if(!id)return;
    const[{data:c,error:ce},{data:subs,error:se}]=await Promise.all([db.from('rewards_push_config').select('public_key').eq('id',true).maybeSingle(),db.from('rewards_push_subscriptions').select('endpoint').eq('user_id',id).eq('device_token_hash',res.locals.deviceHash||'')]);
    if(ce||se)return res.status(503).json({error:'push_unavailable'});res.json({ready:!!c?.public_key,publicKey:c?.public_key||null,endpoints:(subs||[]).map(s=>s.endpoint)});
   });
   app.post('/api/me/push',auth,origin,async(req:any,res:any)=>{res.set('Cache-Control','no-store');if(!validPushSubscription(req.body))return res.status(400).json({error:'invalid_subscription'});const id=await user(res);if(!id)return;
    const{error}=await db.rpc('rewards_push_subscribe',{p_user:id,p_device:res.locals.deviceHash||'',p_endpoint:req.body.endpoint,p_p256dh:req.body.keys.p256dh,p_auth:req.body.keys.auth});
    if(error)return res.status(409).json({error:'subscription_not_saved'});res.json({ok:true});
   });
   app.delete('/api/me/push',auth,origin,async(req:any,res:any)=>{res.set('Cache-Control','no-store');if(typeof req.body?.endpoint!=='string')return res.sendStatus(400);const id=await user(res);if(!id)return;
    const{error}=await db.from('rewards_push_subscriptions').delete().eq('user_id',id).eq('device_token_hash',res.locals.deviceHash||'').eq('endpoint',req.body.endpoint);if(error)return res.status(503).json({error:'push_unavailable'});res.json({ok:true});
   });
   app.post('/api/me/push/test',auth,origin,async(_req:any,res:any)=>{const id=await user(res);if(!id)return;const{error}=await db.rpc('rewards_push_test',{p_user:id,p_device:res.locals.deviceHash||''});if(error)return res.status(429).json({error:'test_not_queued'});res.json({ok:true})});
  }return listen.apply(this,args);
 };
}
