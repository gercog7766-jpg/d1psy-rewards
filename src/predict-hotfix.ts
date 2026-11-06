import express from 'express';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { predictHtml, predictJs } from './predict-ui.js';

export function installPredictHotfix() {
  const proto:any=(express as any).application, get=proto.get, listen=proto.listen;
  let userAuth:any, adminAuth:any;
  proto.get=function(route:any,...handlers:any[]) {
    if(route==='/api/me'&&handlers.length>1)userAuth=handlers[0];
    if(route==='/api/admin/state'&&handlers.length>1)adminAuth=handlers[0];
    return get.call(this,route,...handlers);
  };
  // This wrapper is installed first and sees the final navigation from Games.
  const response:any=(express as any).response, send=response.send;
  response.send=function(body:any) {
    if(typeof body==='string'&&!body.includes('id="predictLink"')) {
      body=body.replace(/(<a\b[^>]*id="gamesLink"[^>]*>Игры<\/a>)/,'$1<a id="predictLink" class="shoplink" href="/predict">Предикт</a>');
    }
    return send.call(this,body);
  };
  proto.listen=function(...args:any[]) {
    const app:any=this;
    if(!app.locals.__predict&&userAuth) {
      app.locals.__predict=true;
      const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
      app.get('/predict',userAuth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(predictHtml));
      app.get('/predict.js',(_req:any,res:any)=>res.type('application/javascript').set('Cache-Control','no-store').send(predictJs));
      app.use('/predict-assets',express.static(path.join(process.cwd(),'assets/teams'),{maxAge:'1d',index:false}));
      async function user(res:any) {
        const {data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();
        if(error||!data){res.status(503).json({error:'predict_unavailable'});return null;}
        return data.id;
      }
      app.get('/api/me/predict',userAuth,async(_req:any,res:any)=>{
        res.set('Cache-Control','no-store');
        const id=await user(res);if(!id)return;
        const {data:matches,error}=await db.from('rewards_predict_matches').select('*').order('starts_at',{ascending:false}).limit(60);
        if(error)return res.status(503).json({error:'predict_unavailable'});
        const visibleMatches=(matches||[]).filter(m=>!['2026-11-06-parivision-navi','2026-11-06-betboom-furia'].includes(m.id));
        const ids=visibleMatches.map(m=>m.id);
        const {data:predictions,error:pe}=ids.length?await db.from('rewards_predictions')
          .select('match_id,winner,score,top_player,updated_at,winner_coins,score_coins,player_coins,settled_at,claimed_at')
          .eq('user_id',id).in('match_id',ids):{data:[],error:null};
        if(pe)return res.status(503).json({error:'predict_unavailable'});
        res.json({serverNow:new Date().toISOString(),matches:visibleMatches.sort((a,b)=>{const rank=(m:any)=>m.status==='scheduled'?(Date.parse(m.starts_at)>Date.now()?0:1):2;const group=rank(a)-rank(b);return group||(rank(a)===0?a.starts_at.localeCompare(b.starts_at):b.starts_at.localeCompare(a.starts_at))}).map(m=>({...m,closes_at:new Date(Date.parse(m.starts_at)-900000).toISOString(),prediction:predictions?.find(p=>p.match_id===m.id)||null}))});
      });
      app.post('/api/me/predict/:id',userAuth,async(req:any,res:any)=>{
        res.set('Cache-Control','no-store');
        const {winner,score,topPlayer}=req.body||{};
        if(!['a','b'].includes(winner)||!['2:0','2:1'].includes(score)||typeof topPlayer!=='string'||topPlayer.length>40)
          return res.status(400).json({error:'invalid_prediction'});
        const id=await user(res);if(!id)return;
        const {data,error}=await db.rpc('rewards_save_prediction',{p_user_id:id,p_match_id:req.params.id,p_winner:winner,p_score:score,p_top_player:topPlayer});
        if(error){const reason=['predictions_closed','invalid_prediction','match_not_found'].find(x=>error.message.includes(x));if(!reason)console.error('predict_save_failed',error.code);return res.status(reason==='invalid_prediction'?400:reason?409:503).json({error:reason||'predict_unavailable'});}
        res.json({ok:true,prediction:{winner:data.winner,score:data.score,top_player:data.top_player,updated_at:data.updated_at}});
      });
      app.post('/api/me/predict/:id/claim',userAuth,async(req:any,res:any)=>{
        res.set('Cache-Control','no-store');
        const expected=new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin;
        if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==expected))return res.sendStatus(403);
        if(!req.is('application/json'))return res.sendStatus(415);
        const id=await user(res);if(!id)return;
        const {data,error}=await db.rpc('rewards_claim_prediction',{p_user_id:id,p_match_id:req.params.id});
        if(error){const reason=['user_unavailable','match_not_found','result_pending','prediction_not_found','no_reward'].find(x=>error.message.includes(x));if(!reason)console.error('predict_claim_failed',error.code);return res.status(reason?409:503).json({error:reason||'claim_unavailable'})}
        res.json(data);
      });
      if(adminAuth)app.post('/api/admin/predict/:id/settle',adminAuth,async(req:any,res:any)=>{
        const {winner,score,topPlayers}=req.body||{};
        if(!['a','b'].includes(winner)||!['2:0','2:1'].includes(score)||!Array.isArray(topPlayers)||topPlayers.length<1||topPlayers.length>10||topPlayers.some(x=>typeof x!=='string'||x.length>40))return res.status(400).json({error:'invalid_result'});
        const {data,error}=await db.rpc('rewards_settle_predictions',{p_match_id:req.params.id,p_winner:winner,p_score:score,p_top_players:topPlayers});
        if(error)return res.status(409).json({error:['invalid_result','result_already_set','match_not_finished','match_not_found'].find(x=>error.message.includes(x))||'settlement_failed'});
        res.set('Cache-Control','no-store').json(data);
      });
    }
    return listen.apply(this,args);
  };
}
