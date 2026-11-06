import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {contractsHtml,contractsJs} from './contracts-ui.js';
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function installContracts(){
 const proto:any=(express as any).application,get=proto.get,listen=proto.listen;let auth:any;
 proto.get=function(route:any,...handlers:any[]){if(route==='/api/me'&&handlers.length>1)auth=handlers[0];return get.call(this,route,...handlers)};
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){if(typeof body==='string'&&body.includes('</html>')&&!body.includes('id="contractsLink"'))body=body.replace(/(<a\b[^>]*href="\/upgrader"[^>]*>[\s\S]*?<\/a>)/,'$1<a id="contractsLink" class="shoplink back" href="/contracts">Контракты</a>');return send.call(this,body)};
 proto.listen=function(...args:any[]){if(!this.locals.__contractsInventory&&auth){this.locals.__contractsInventory=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  const user=async(res:any)=>{const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'contracts_unavailable'});return null}return data.id};
  this.get('/contracts',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(contractsHtml));
  this.get('/contracts.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-store').send(contractsJs));
  this.get('/api/me/contracts',auth,async(_req:any,res:any)=>{
   const id=await user(res);if(!id)return;const inventory:any[]=[];
   for(let start=0;;start+=500){const{data,error}=await db.from('rewards_wins').select('id,item_wear,item_variant_kind,rewards_prizes!inner(name,image_url,sell_price_coins)').eq('user_id',id).eq('choice_status','awaiting_choice').in('delivery_status',['pending','awaiting_choice']).order('id').range(start,start+499);
    if(error)return res.status(503).json({error:'contracts_unavailable'});
    for(const w of data||[]){const p:any=Array.isArray(w.rewards_prizes)?w.rewards_prizes[0]:w.rewards_prizes;if(p?.sell_price_coins>0)inventory.push({id:w.id,name:p.name,imageUrl:p.image_url,price:p.sell_price_coins,wear:w.item_wear,kind:w.item_variant_kind})}if(!data||data.length<500)break;
   }res.set('Cache-Control','no-store').json({inventory});
  });
  this.post('/api/me/contracts',auth,express.json({limit:'8kb'}),async(req:any,res:any)=>{
   res.set('Cache-Control','no-store');const origin=req.get('origin');if(origin&&origin!==new URL(process.env.APP_URL||'https://d1psy-rewards.onrender.com').origin)return res.status(403).json({error:'invalid_origin'});
   const{sourceWinIds,requestId}=req.body||{};if(!uuid(requestId)||!Array.isArray(sourceWinIds)||sourceWinIds.length<3||sourceWinIds.length>10||!sourceWinIds.every(uuid)||new Set(sourceWinIds.map((x:string)=>x.toLowerCase())).size!==sourceWinIds.length)return res.status(400).json({error:'invalid_request'});
   const id=await user(res);if(!id)return;
   const{data,error}=await db.rpc('rewards_run_contract',{p_user_id:id,p_source_win_ids:sourceWinIds,p_request_id:requestId});
   if(error){const known=['source_not_available','no_contract_result','invalid_request','request_conflict'];return res.status(409).json({error:known.find(x=>String(error.message).includes(x))||'contracts_unavailable'})}res.json(data);
  });
 }return listen.apply(this,args)};
}
