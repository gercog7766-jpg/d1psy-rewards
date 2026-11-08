import express from 'express';
import {nightRunCharacter} from './night-run-character.js';
import {randomInt} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {nightRunHtml,nightRunJs} from './night-run-ui.js';
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function installNightRun(){
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(route:any,...hs:any[]){if(route==='/api/me'&&hs.length>1)auth=hs[0];return get.call(this,route,...hs)};
 p.listen=function(...args:any[]){const app:any=this;if(auth&&!app.locals.__nightRun){app.locals.__nightRun=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const rates=new Map<string,{at:number,n:number}>();
  const limit=(id:string)=>{const now=Date.now(),old=rates.get(id),r=old&&old.at>now?old:{at:now+60000,n:0};r.n++;rates.set(id,r);if(rates.size>5000)for(const[k,v]of rates)if(v.at<now)rates.delete(k);return r.n>90};
  function origin(q:any,r:any,n:any){const expected=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;if(q.get('sec-fetch-site')==='cross-site'||(q.get('origin')&&q.get('origin')!==expected))return r.sendStatus(403);if(!q.is('application/json'))return r.sendStatus(415);n()}
  async function call(q:any,r:any,action:string,params:any={}){r.set('Cache-Control','no-store');const{data:u,error:e}=await db.from('rewards_users').select('id').eq('twitch_user_id',r.locals.session.twitchUserId).single();if(e||!u)return r.status(503).json({error:'game_unavailable'});if(limit(u.id))return r.status(429).json({error:'too_many_requests'});const{data,error}=await db.rpc('rewards_nr_'+action,{p_user:u.id,...params});if(error){const reason=['invalid_request','user_unavailable','game_not_found','too_fast','stale_game','cooldown_active','client_update_required'].find(s=>error.message.includes(s));if(!reason)console.error('night_run_rpc_failed',error.code);return r.status(reason?409:503).json({error:reason||'game_unavailable'})}r.json(data)}
  app.get('/games/night-run-cat-v1.webp',(_q:any,r:any)=>r.type('webp').set('Cache-Control','public,max-age=31536000,immutable').send(Buffer.from(nightRunCharacter,'base64')));
  app.get('/games/night-run',auth,(_q:any,r:any)=>r.set('Cache-Control','no-store').send(nightRunHtml));
  app.get('/games/night-run.js',(_q:any,r:any)=>r.type('application/javascript').set('Cache-Control','no-cache').send(nightRunJs));
  app.get('/api/me/night-run/leaderboard',auth,(q:any,r:any)=>call(q,r,'leaderboard'));
  app.get('/api/me/night-run',auth,(q:any,r:any)=>call(q,r,'state'));
  app.post('/api/me/night-run/start',auth,origin,(q:any,r:any)=>{if(!q.body||Object.keys(q.body).some(k=>!['requestId','version'].includes(k))||!uuid(q.body.requestId)||(q.body.version!==undefined&&![1,2,3].includes(q.body.version)))return r.status(400).json({error:'invalid_request'});return call(q,r,q.body.version===3?'start_v3':q.body.version===2?'start_v2':'start',{p_id:q.body.requestId,p_seed:randomInt(1,2147483647)})});
  app.post('/api/me/night-run/step',auth,origin,(q:any,r:any)=>{const b=q.body||{};if(Object.keys(b).some(k=>!['gameId','from','inputs','stop'].includes(k))||!uuid(b.gameId)||!Number.isSafeInteger(b.from)||b.from<0||!Array.isArray(b.inputs)||b.inputs.length>30||(!b.inputs.length&&b.stop!==true)||b.inputs.some((v:any)=>!Number.isInteger(v)||v<0||v>2)||(b.stop!==undefined&&typeof b.stop!=='boolean'))return r.status(400).json({error:'invalid_request'});return call(q,r,'step',{p_game:b.gameId,p_from:b.from,p_inputs:b.inputs,p_stop:b.stop===true})});
 let expiring=false;const expireTimer=setInterval(async()=>{if(expiring)return;expiring=true;try{const {error}=await db.rpc('rewards_nr_expire_v3',{p_limit:30});if(error)console.error('night_run_expiry_failed',error.code)}catch{console.error('night_run_expiry_unavailable')}finally{expiring=false}},5000);expireTimer.unref();
 }return listen.apply(this,args)};
}
