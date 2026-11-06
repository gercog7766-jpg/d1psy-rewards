import {createClient} from 'npm:@supabase/supabase-js@2.78.0';
import webpush from 'npm:web-push@3.6.7';
import {deliverJobs} from './delivery.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function same(a:string,b:string){const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));const[x,y]=await Promise.all([digest(a),digest(b)]);let different=0;for(let i=0;i<x.length;i++)different|=x[i]^y[i];return different===0}
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 // Own webhook authentication; no browser or user JWT may dispatch deliveries.
 const provided=req.headers.get('x-push-dispatch-key')||'';
 if(!/^[a-f0-9]{64}$/.test(provided))return new Response('Unauthorized',{status:401});
 const {data:config,error}=await db.rpc('rewards_push_credentials');
 if(error||!config)return new Response('Unavailable',{status:503});
 if(!await same(provided,config.dispatchKey))return new Response('Unauthorized',{status:401});
 try{
  const report=await deliverJobs(db,async(sub,payload)=>{
   const u=new URL(sub.endpoint),h=u.hostname;
   if(u.protocol!=='https:'||u.port||u.username||u.password||!(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com')))throw Object.assign(Error('bad_endpoint'),{statusCode:400});
   const details=webpush.generateRequestDetails(sub,payload,{TTL:86400,urgency:'normal',vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey}});
   const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(8000)});
   await response.body?.cancel();if(!response.ok)throw Object.assign(Error('push_rejected'),{statusCode:response.status});
  });return Response.json(report);
 }catch{console.error('push_dispatch_failed');return new Response('Dispatch failed',{status:503})}
});
