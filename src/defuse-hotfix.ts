import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {createDefusePuzzles,DEFUSE_LEVELS,publicDefuse,type DefuseDifficulty} from './defuse-game.js';
import {defuseHtml,defuseJs} from './defuse-ui.js';
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export function installDefuse(){
 const proto:any=(express as any).application,get=proto.get,listen=proto.listen;let auth:any;
 proto.get=function(route:any,...hs:any[]){if(route==='/api/me'&&hs.length>1)auth=hs[0];return get.call(this,route,...hs)};
 proto.listen=function(...args:any[]){const app:any=this;if(!app.locals.__defuse&&auth){app.locals.__defuse=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const rate=new Map<string,{count:number,until:number}>();
  function limit(id:string){const now=Date.now(),r=rate.get(id);if(r&&r.until>now&&r.count>=40)return true;rate.set(id,{count:r&&r.until>now?r.count+1:1,until:r&&r.until>now?r.until:now+60000});if(rate.size>5000)for(const[k,v]of rate)if(v.until<now)rate.delete(k);return false}
  function origin(req:any,res:any,next:any){const o=process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000);if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==new URL(o).origin))return res.sendStatus(403);if(!req.is('application/json'))return res.sendStatus(415);next()}
  async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'game_unavailable'});return null}return data.id}
  async function call(res:any,name:string,params:any){const{data,error}=await db.rpc(name,params);res.set('Cache-Control','no-store');if(error){const reason=['invalid_request','user_unavailable','game_not_found','stale_stage','memorize_first'].find(x=>error.message.includes(x));if(!reason)console.error('defuse_rpc_failed',error.code);return res.status(reason?409:503).json({error:reason||'game_unavailable'})}res.json(publicDefuse(data))}
  app.get('/games/defuse',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(defuseHtml));
  app.get('/games/defuse.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-cache').send(defuseJs));
  app.get('/api/me/defuse',auth,async(_req:any,res:any)=>{const id=await user(res);if(id)await call(res,'rewards_defuse_state',{p_user:id})});
  app.post('/api/me/defuse/start',auth,origin,async(req:any,res:any)=>{const{difficulty,requestId}=req.body||{};if(typeof difficulty!=='string'||!Object.hasOwn(DEFUSE_LEVELS,difficulty)||!uuid(requestId))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;if(limit(id))return res.status(429).json({error:'too_many_requests'});await call(res,'rewards_defuse_start',{p_user:id,p_id:requestId,p_difficulty:difficulty,p_puzzles:createDefusePuzzles(difficulty as DefuseDifficulty)})});
  app.post('/api/me/defuse/answer',auth,origin,async(req:any,res:any)=>{const{gameId,stage,answer,requestId}=req.body||{};if(!uuid(gameId)||!uuid(requestId)||!Number.isInteger(stage)||stage<0||stage>2||typeof answer!=='string'||!/^\d{1,12}$/.test(answer))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;if(limit(id))return res.status(429).json({error:'too_many_requests'});await call(res,'rewards_defuse_answer',{p_user:id,p_game:gameId,p_stage:stage,p_answer:answer,p_request:requestId})});
 }return listen.apply(this,args)};
}
