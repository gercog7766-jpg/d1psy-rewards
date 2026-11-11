import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { skinBattlesHtml, skinBattlesJs } from './skin-battles-ui.js';

const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export function installSkinBattles(){
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(route:any,...handlers:any[]){if(route==='/api/me'&&handlers.length>1)auth=handlers[0];return get.call(this,route,...handlers)};
 p.listen=function(...args:any[]){const app:any=this;if(!app.locals.__skinBattles&&auth){app.locals.__skinBattles=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const limited=new Map<string,{n:number,until:number}>();
  function rate(key:string){const now=Date.now(),v=limited.get(key);if(v&&v.until>now&&v.n>=12)return true;limited.set(key,v&&v.until>now?{n:v.n+1,until:v.until}:{n:1,until:now+60000});if(limited.size>5000)for(const[k,x]of limited)if(x.until<now)limited.delete(k);return false}
  async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'game_unavailable'});return null}return data.id}
  const known=['invalid_player_count','user_not_found','already_in_battle','skin_not_available','battle_id_in_use','battle_not_found','battle_closed','battle_full','not_creator'];
  async function rpc(res:any,name:string,params:any){const{data,error}=await db.rpc(name,params);res.set('Cache-Control','no-store');if(error){const reason=known.find(x=>error.message.includes(x));if(!reason)console.error('skin_battle_rpc_failed',name,error.code);return res.status(reason?409:503).json({error:reason||'game_unavailable'})}return res.json(data)}
  app.get('/games/battles',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(skinBattlesHtml));
  app.get('/games/battles.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-store').send(skinBattlesJs));
  app.get('/api/me/skin-battles',auth,async(_req:any,res:any)=>{const id=await user(res);if(!id)return;await rpc(res,'rewards_skin_battle_state',{p_user:id})});
  app.post('/api/me/skin-battles/create',auth,async(req:any,res:any)=>{const{battleId,winId,maxPlayers}=req.body||{};if(!uuid(battleId)||!uuid(winId)||!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>4)return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;if(rate('create:'+id))return res.status(429).json({error:'too_many_attempts'});await rpc(res,'rewards_skin_battle_create',{p_user:id,p_battle:battleId,p_max_players:maxPlayers,p_win_id:winId})});
  app.post('/api/me/skin-battles/:id/join',auth,async(req:any,res:any)=>{if(!uuid(req.params.id)||!uuid(req.body?.winId))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;if(rate('join:'+id))return res.status(429).json({error:'too_many_attempts'});await rpc(res,'rewards_skin_battle_join',{p_user:id,p_battle:req.params.id,p_win_id:req.body.winId})});
  app.post('/api/me/skin-battles/:id/cancel',auth,async(req:any,res:any)=>{if(!uuid(req.params.id))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;await rpc(res,'rewards_skin_battle_cancel',{p_user:id,p_battle:req.params.id})});
 }return listen.apply(this,args)};
}
