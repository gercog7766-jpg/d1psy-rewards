import crypto from 'node:crypto';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fullCoinBalance } from './coin-ledger-paged.js';

const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});

async function currentUser(req:any,res:any){
 try{
  const secret=process.env.SESSION_SECRET||'',raw=req.cookies?.rewards_session;
  if(!raw||!secret){res.status(401).json({error:'authentication_required'});return null}
  const [p,s]=raw.split('.'),expected=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  if(!p||!s||Buffer.byteLength(s)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))){res.status(401).json({error:'authentication_required'});return null}
  const session=JSON.parse(Buffer.from(p,'base64url').toString());
  if(session.exp<=Date.now()){res.status(401).json({error:'authentication_required'});return null}
  const {data}=await db.from('rewards_users').select('id').eq('twitch_user_id',session.twitchUserId).single();
  if(!data){res.status(401).json({error:'authentication_required'});return null}
  return data;
 }catch{res.status(401).json({error:'authentication_required'});return null}
}

const isUuid=(value:unknown):value is string=>typeof value==='string'&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const validGroup=(ids:unknown)=>Array.isArray(ids)&&ids.length>=1&&ids.length<=4&&ids.every(isUuid)&&new Set(ids.map(id=>id.toLowerCase())).size===ids.length;
const upgradeErrors=['source_not_found','source_not_available','source_has_no_value','source_already_used','target_not_available','target_variant_not_available','target_must_be_more_expensive','chance_too_low','invalid_extra_coins','insufficient_coins'];
function payload(x:any){return {ok:true,result:x.result,chanceBps:Number(x.chance_bps),rollBps:Number(x.roll_bps),upgradeId:x.id||x.upgrade_id,rewardWinId:x.reward_win_id||null}}

export function installUpgraderRunFixHotfix(){
 const proto:any=(express as any).application;if(proto.__upgraderRunFix)return;proto.__upgraderRunFix=true;const listen=proto.listen;
 proto.listen=function(...args:any[]){
  const app:any=this;
  if(!app.locals.__upgraderRunFix){
   app.locals.__upgraderRunFix=true;
   app.get('/api/me/upgrader/balance',async(req:any,res:any)=>{
    const u=await currentUser(req,res);if(!u)return;
    res.set('Cache-Control','no-store');
    try{res.json({balance:await fullCoinBalance(db,u.id)})}
    catch{res.status(503).json({error:'balance_load_failed'})}
   });
   app.post('/api/me/upgrader/run',express.json(),async(req:any,res:any)=>{
    const u=await currentUser(req,res);if(!u)return;
    let {sourceWinId,targetShopItemId,targetVariantId}=req.body||{};
    const extraCoins=req.body?.extraCoins??0;
    if(!Number.isSafeInteger(extraCoins)||extraCoins<0||extraCoins>2147483647)return res.status(400).json({error:'invalid_extra_coins'});
    const {sourceWinIds,targets}=req.body||{};
    if(sourceWinIds!==undefined||targets!==undefined){
     if(!validGroup(sourceWinIds)||!Array.isArray(targets)||!validGroup(targets.map(target=>target?.variantId))||!targets.every(target=>isUuid(target.itemId))){
      return res.status(400).json({error:'invalid_request'});
     }
     if(sourceWinIds.length!==1||targets.length!==1){
      const {data,error}=await db.rpc('rewards_run_skin_upgrade_multi',{
       p_user_id:u.id,p_source_win_ids:sourceWinIds,p_target_shop_item_ids:targets.map(target=>target.itemId),
       p_target_variant_ids:targets.map(target=>target.variantId),p_extra_coins:extraCoins
      });
      if(error)return res.status(409).json({error:upgradeErrors.find(code=>error.message.includes(code))||'upgrade_failed'});
      const result=Array.isArray(data)?data[0]:data;
      if(!result||!['won','lost'].includes(result.result))return res.status(500).json({error:'invalid_upgrade_result'});
      return res.json(payload(result));
     }
     sourceWinId=sourceWinIds[0];
     targetShopItemId=targets[0].itemId;
     targetVariantId=targets[0].variantId;
    }
    if(!isUuid(sourceWinId)||!isUuid(targetShopItemId)||!isUuid(targetVariantId))return res.status(400).json({error:'invalid_request'});

    const {data:existing}=await db.from('rewards_upgrades').select('id,result,chance_bps,roll_bps,reward_win_id,target_shop_item_id,target_shop_variant_id,extra_coins').eq('user_id',u.id).eq('source_win_id',sourceWinId).maybeSingle();
    if(existing){
     if(existing.target_shop_item_id!==targetShopItemId||existing.target_shop_variant_id!==targetVariantId||Number(existing.extra_coins||0)!==extraCoins)return res.status(409).json({error:'source_already_used'});
     return res.status(200).json(payload(existing));
    }

    const {data,error}=await db.rpc('rewards_run_skin_upgrade',{p_user_id:u.id,p_source_win_id:sourceWinId,p_target_shop_item_id:targetShopItemId,p_target_variant_id:targetVariantId,p_extra_coins:extraCoins});
    if(error){
     const {data:saved}=await db.from('rewards_upgrades').select('id,result,chance_bps,roll_bps,reward_win_id,target_shop_item_id,target_shop_variant_id,extra_coins').eq('user_id',u.id).eq('source_win_id',sourceWinId).maybeSingle();
     if(saved&&saved.target_shop_item_id===targetShopItemId&&saved.target_shop_variant_id===targetVariantId&&Number(saved.extra_coins||0)===extraCoins)return res.status(200).json(payload(saved));
     const m=String(error.message||'');
     return res.status(409).json({error:upgradeErrors.find(x=>m.includes(x))||'upgrade_failed'});
    }
    const x=Array.isArray(data)?data[0]:data;
    if(!x||!['won','lost'].includes(String(x.result)))return res.status(500).json({error:'invalid_upgrade_result'});
    return res.status(200).json(payload(x));
   });
  }
  return listen.apply(this,args);
 };
}
