import express from 'express';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { dailyPool, DICTIONARY, moscowDay, normalizeGuess, publicGame } from './wordly.js';
import { gamesHtml, wordlyHtml, wordlyJs } from './games-ui.js';

export function installGamesHotfix() {
  const p:any=(express as any).application, get=p.get, listen=p.listen;
  let auth:any;
  p.get=function(path:any,...handlers:any[]) {
    if(path==='/api/me' && handlers.length>1) auth=handlers[0];
    return get.call(this,path,...handlers);
  };
  // Installed before the existing wrappers so this transformation runs after
  // both Promo and Upgrader have inserted their navigation buttons.
  const response:any=(express as any).response, send=response.send;
  response.send=function(body:any) {
    if(typeof body==='string' && body.includes('id="promoOpen"') && !body.includes('id="gamesLink"')) {
      body=body.replace(/(<button\b[^>]*id="promoOpen"[^>]*>[\s\S]*?<\/button>)/,'$1<a id="gamesLink" class="shoplink" href="/games">Игры</a>');
    }
    return send.call(this,body);
  };
  p.listen=function(...args:any[]) {
    const app:any=this;
    if(!app.locals.__games && auth) {
      app.locals.__games=true;
      const db=createClient(process.env.SUPABASE_URL||'https://ssqjogdcynmjjgtxknng.supabase.co',process.env.SUPABASE_SECRET_KEY||'not-configured',{auth:{persistSession:false}});
      app.get('/games',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(gamesHtml));
      app.get('/games/wordly',auth,(_req:any,res:any)=>res.set('Cache-Control','no-store').send(wordlyHtml));
      app.get('/games/wordly.js',(_req:any,res:any)=>res.type('application/javascript').send(wordlyJs));
      async function user(res:any) {
        const {data,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).single();
        if(error||!data) {res.status(503).json({error:'game_unavailable'});return null;}
        return data.id;
      }
      app.get('/api/me/games/wordly',auth,async(_req:any,res:any)=>{
        res.set('Cache-Control','no-store');
        const id=await user(res); if(!id)return;
        const day=moscowDay();
        const {data,error}=await db.from('rewards_wordly_games').select('answer,guesses,reward_transaction_id').eq('user_id',id).eq('game_day',day).maybeSingle();
        if(error)return res.status(503).json({error:'game_unavailable'});
        res.json(publicGame(data,day));
      });
      app.post('/api/me/games/wordly/guess',auth,async(req:any,res:any)=>{
        res.set('Cache-Control','no-store');
        const day=moscowDay(), guess=normalizeGuess(req.body?.guess), requestId=req.body?.requestId;
        if(req.body?.day!==day)return res.status(409).json({error:'new_day'});
        if(!/^[а-я]{5}$/.test(guess)||!DICTIONARY.has(guess))return res.status(400).json({error:'unknown_word'});
        if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return res.status(400).json({error:'invalid_request'});
        const id=await user(res); if(!id)return;
        const secret=process.env.SESSION_SECRET;
        if(!secret)return res.status(503).json({error:'game_unavailable'});
        const pool=dailyPool(day,secret);
        const {data,error}=await db.rpc('rewards_wordly_guess',{p_user_id:id,p_day:day,p_guess:guess,p_request_id:requestId,p_answer:pool[randomInt(pool.length)]});
        if(error) { console.error('wordly_guess_failed',error.code);return res.status(error.message.includes('new_day')?409:503).json({error:error.message.includes('new_day')?'new_day':'game_unavailable'}); }
        res.json(publicGame(data,day));
      });
    }
    return listen.apply(this,args);
  };
}
