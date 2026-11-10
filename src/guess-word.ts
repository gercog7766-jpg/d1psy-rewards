import express from 'express';
import type {Express,RequestHandler} from 'express';
import {guessWordHtml,guessWordAdminHtml,guessWordJs,guessWordAdminJs} from './guess-word-ui.js';
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
export const normalizeWord=(s:string)=>s.trim().toLowerCase().replace(/ё/g,'е');
export function installGuessWord(app:Express,user:RequestHandler,admin:RequestHandler,db:any){
 const privatePage:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private,no-store');n()};
 const origin:RequestHandler=(q,r,n)=>{if(q.get('sec-fetch-site')==='cross-site'||q.get('origin')&&q.get('origin')!==new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin)return void r.sendStatus(403);if(!q.is('application/json'))return void r.sendStatus(415);n()};
 const buckets=new Map<string,{n:number,end:number}>();
 const limit=(max:number):RequestHandler=>(_q,r,n)=>{const now=Date.now(),key=r.locals.session.twitchUserId+':'+max;let row=buckets.get(key);if(!row||row.end<now){row={n:0,end:now+60000};buckets.set(key,row)}if(++row.n>max)return void r.status(429).json({error:'rate_limited'});if(buckets.size>2000)for(const[k,v]of buckets)if(v.end<now)buckets.delete(k);n()};
 async function rpc(r:any,action:string,body:any={}){const {data,error}=await db.rpc('rewards_guess_word',{p_actor:r.locals.session.twitchUserId,p_action:action,p_body:body});if(error){const reason=['owner_required','user_unavailable','request_conflict','round_active','round_closed','invalid_length','insufficient_coins','invalid_prize','invalid_request'].find(x=>String(error.message).includes(x));if(!reason)console.error('guess_word_unavailable',error.code);return r.status(reason==='owner_required'||reason==='user_unavailable'?403:reason?409:503).json({error:reason||'game_unavailable'})}return r.json(data)}
 app.get('/games/guess-word',privatePage,user,(_q,r)=>r.send(guessWordHtml));
 app.get('/admin/guess-word',privatePage,admin,(_q,r)=>r.send(guessWordAdminHtml));
 for(const[path,js]of [['/games/guess-word.js',guessWordJs],['/games/guess-word-admin.js',guessWordAdminJs]])app.get(path,(_q,r)=>r.type('application/javascript').set('Cache-Control','no-cache').send(js));
 app.get('/api/me/guess-word',privatePage,user,limit(120),async(q,r)=>{if(Object.keys(q.query).length)return void r.status(400).json({error:'invalid_request'});await rpc(r,'state')});
 app.get('/api/admin/guess-word',privatePage,admin,limit(120),async(q,r)=>{if(Object.keys(q.query).some(k=>k!=='q')||q.query.q!==undefined&&(typeof q.query.q!=='string'||q.query.q.length>80))return void r.status(400).json({error:'invalid_request'});await rpc(r,'admin',{query:q.query.q||''})});
 app.post('/api/me/guess-word/guess',privatePage,user,origin,limit(30),async(q,r)=>{const b=q.body;if(!b||Array.isArray(b)||Object.keys(b).length!==3||Object.keys(b).some(k=>!['roundId','guess','requestId'].includes(k))||!uuid(b.roundId)||!uuid(b.requestId)||typeof b.guess!=='string'||b.guess.length>60||! /^[а-яa-z]{2,24}$/.test(normalizeWord(b.guess)))return void r.status(400).json({error:'invalid_request'});await rpc(r,'guess',b)});
 for(const action of ['start','cancel'])app.post('/api/admin/guess-word/'+action,privatePage,admin,origin,limit(30),async(q,r)=>{const b=q.body;const keys=action==='cancel'?['roundId']:['word','hint','cost','prizeType','prizeCoins','prizeId','requestId'];if(!b||Array.isArray(b)||Object.keys(b).length!==keys.length||Object.keys(b).some(k=>!keys.includes(k)))return void r.status(400).json({error:'invalid_request'});if(action==='cancel'?!uuid(b.roundId):!uuid(b.requestId)||typeof b.word!=='string'||b.word.length>60||! /^[а-яa-z]{2,24}$/.test(normalizeWord(b.word))||typeof b.hint!=='string'||!b.hint.trim()||b.hint.length>180||!integer(b.cost,1,10000)||!(b.prizeType==='coins'&&integer(b.prizeCoins,1,1000000)&&b.prizeId===null||b.prizeType==='skin'&&uuid(b.prizeId)&&b.prizeCoins===null))return void r.status(400).json({error:'invalid_request'});await rpc(r,action,b)});
}
export function installGuessWordDecorations(){const response:any=(express as any).response,send=response.send;response.send=function(body:any){const path=this.req?.path;if(typeof body==='string'){
  if(path==='/admin'&&!body.includes('id="guessWordAdminLink"'))body=body.replace('<div class="tabs">','<div class="tabs"><a id="guessWordAdminLink" href="/admin/guess-word" style="padding:10px 14px;border-radius:10px;background:#30243f;color:white;text-decoration:none">Угадай слово</a>');
 }return send.call(this,body)};
}
