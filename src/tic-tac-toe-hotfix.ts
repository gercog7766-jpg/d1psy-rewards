import express from 'express';
import {createHmac,randomInt} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {tttHtml,tttJs} from './tic-tac-toe-ui.js';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function installTicTacToe(){
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(route:any,...hs:any[]){if(route==='/api/me'&&hs.length>1)auth=hs[0];return get.call(this,route,...hs)};
 p.listen=function(...args:any[]){const app:any=this;if(!app.locals.__ttt&&auth){app.locals.__ttt=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const attempts=new Map<string,{count:number,until:number}>();
  function limited(key:string){const t=Date.now(),v=attempts.get(key);if(v&&v.until>t&&v.count>=10)return true;attempts.set(key,{count:v&&v.until>t?v.count+1:1,until:v&&v.until>t?v.until:t+60000});if(attempts.size>5000)for(const[k,x]of attempts)if(x.until<t)attempts.delete(k);return false}
  const proof=(id:string,password:string)=>{const secret=process.env.SESSION_SECRET;if(!secret)throw Error('session_secret_required');return createHmac('sha256',secret).update('ttt-password:'+id.toLowerCase()+':'+password).digest('hex')};
  const known=['already_in_room','wrong_password','room_closed','room_not_found','not_participant','game_finished','stale_move','not_your_turn','invalid_cell','user_not_found'];
  async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'game_unavailable'});return null}return data.id}
  async function rpc(res:any,name:string,params:any){const{data,error}=await db.rpc(name,params);if(error){const reason=known.find(x=>error.message.includes(x));if(!reason)console.error('ttt_rpc_failed',name,error.code);res.status(reason?409:503).json({error:reason||'game_unavailable'});return}res.set('Cache-Control','no-store').json(data)}
  app.get('/games/tic-tac-toe',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(tttHtml));
  app.get('/games/tic-tac-toe.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-store').send(tttJs));
  app.get('/api/me/tic-tac-toe',auth,async(req:any,res:any)=>{if(req.query.room!==undefined&&!uuid(req.query.room))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;await rpc(res,'rewards_ttt_state',{p_user:id,p_room:req.query.room||null})});
  app.post('/api/me/tic-tac-toe/create',auth,async(req:any,res:any)=>{
   const{roomId,isPrivate,password}=req.body||{};if(!uuid(roomId)||typeof isPrivate!=='boolean'||(isPrivate&&(typeof password!=='string'||password.length<4||password.length>64)))return res.status(400).json({error:'invalid_password'});
   const id=await user(res);if(!id)return;if(limited('create:'+id))return res.status(429).json({error:'too_many_attempts'});let hash=null;try{if(isPrivate)hash=proof(roomId,password)}catch{return res.status(503).json({error:'game_unavailable'})}
   await rpc(res,'rewards_ttt_create',{p_user:id,p_room:roomId,p_password_hash:hash});
  });
  for(const action of ['join','move','leave'])app.post('/api/me/tic-tac-toe/:id/'+action,auth,async(req:any,res:any)=>{
   if(!uuid(req.params.id))return res.status(400).json({error:'invalid_request'});const id=await user(res);if(!id)return;
   const params:any={p_user:id,p_room:req.params.id};
   if(action==='join'){
    const password=req.body?.password??'';if(typeof password!=='string'||password.length>64)return res.status(400).json({error:'invalid_password'});
    if(limited('join:'+id))return res.status(429).json({error:'too_many_attempts'});
    try{params.p_password_hash=proof(req.params.id,password)}catch{return res.status(503).json({error:'game_unavailable'})}
    params.p_host_x=randomInt(2)===0;
   }
   if(action==='move'){if(!Number.isInteger(req.body?.cell)||req.body.cell<0||req.body.cell>8||!Number.isInteger(req.body?.revision)||req.body.revision<0)return res.status(400).json({error:'invalid_cell'});params.p_cell=req.body.cell;params.p_revision=req.body.revision}
   await rpc(res,'rewards_ttt_'+action,params);
  });
 }return listen.apply(this,args)};
}
