import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {marketCss,marketToolbar,marketBoot} from './market-ui.js';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function installMarket(){
 const p:any=(express as any).application,get=p.get,listen=p.listen;let auth:any;
 p.get=function(route:any,...hs:any[]){if(route==='/api/me'&&hs.length>1)auth=hs[0];return get.call(this,route,...hs)};
 const response:any=(express as any).response,send=response.send;
 response.send=function(body:any){
  if(typeof body==='string'){
   const route=this.req?.path;
   if(route==='/shop'&&body.includes('<title>Магазин — d1psy Rewards</title>')&&!body.includes('id="marketGoal"')){
    body=body.replace('</head>','<style id="d1MarketStyle">'+marketCss+'</style></head>')
     .replace('<title>Магазин — d1psy Rewards</title>','<title>D1PSY MARKET · Магазин</title>')
     .replace('<h1>Магазин</h1>','<div class="marketEyebrow">D1PSY MARKET</div><h1>Магазин</h1>')
     .replace('<div class="layout">','<section id="marketGoal" class="marketGoal" aria-live="polite">Загрузка цели…</section><div id="marketNotice" class="marketNotice" role="status"></div><div class="layout">')
     .replace('<input id="search"',marketToolbar+'<input id="search"')
     .replace('<div class="priceRow">','<div id="marketModalActions" class="marketModalActions"></div><div class="priceRow">');
   }
   if(route==='/shop-v2.js'&&body.includes('var P=window.D1P===true')&&!body.includes('D1_MARKET_V1')){
    body=body.replace('if(vr.ok){','marketVariantsReady=vr.ok;if(vr.ok){');const end=body.lastIndexOf('})();');if(end!==-1)body=body.slice(0,end)+marketBoot+body.slice(end);
   }
   if(route==='/account'&&!body.includes('id="marketProfileLink"')){
    body=body.replace(/(<button\b[^>]*id="profileBtn"[^>]*>[\s\S]*?<\/button>)/,'$1<a id="marketProfileLink" class="profile-btn" style="text-decoration:none" href="/shop?view=favorites">♡ Мои желания</a>');
    if(!body.includes('id="marketProfileLink"'))body=body.replace('<h2>Инвентарь</h2>','<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><h2>Инвентарь</h2><a id="marketProfileLink" class="shoplink" style="text-decoration:none;font-size:13px" href="/shop?view=favorites">♡ Мои желания</a></div>');
   }
  }
  return send.call(this,body);
 };
 p.listen=function(...args:any[]){const app:any=this;if(!app.locals.__market&&auth){app.locals.__market=true;
  const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
  async function user(res:any){const{data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();if(error||!data){res.status(503).json({error:'market_unavailable'});return null}return data.id}
  app.get('/api/me/market',auth,async(_req:any,res:any)=>{const id=await user(res);if(!id)return;const{data,error}=await db.rpc('rewards_market_state',{p_user:id});if(error){console.error('market_state_failed',error.code);return res.status(503).json({error:'market_unavailable'})}res.set('Cache-Control','no-store').json(data)});
  app.post('/api/me/market',auth,async(req:any,res:any)=>{
   const{action,itemId,variantId}=req.body||{};
   if(!['favorite','unfavorite','goal','clear_goal'].includes(action)||(action!=='clear_goal'&&(!uuid(itemId)||(variantId!=null&&!uuid(variantId)))))return res.status(400).json({error:'invalid_request'});
   const id=await user(res);if(!id)return;
   const{data,error}=await db.rpc('rewards_market_set',{p_user:id,p_action:action,p_item:action==='clear_goal'?null:itemId||null,p_variant:action==='clear_goal'?null:variantId||null});
   if(error){const reason=['item_not_found','variant_not_found','item_unavailable','choose_variant','favorites_limit'].find(x=>error.message.includes(x));if(!reason)console.error('market_save_failed',error.code);return res.status(reason?409:503).json({error:reason||'market_unavailable'})}
   res.set('Cache-Control','no-store').json(data);
  });
 }return listen.apply(this,args)};
}
