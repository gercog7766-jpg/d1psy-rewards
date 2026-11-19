import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolve} from 'node:path';
import {adventHtml,adventJs} from './advent-ui.js';

export function installAdvent(app:Express,db:SupabaseClient,user:RequestHandler,origin:string){
 const noStore:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private, no-store');n()};
 const sameOrigin:RequestHandler=(q,r,n)=>{if(q.get('sec-fetch-site')==='cross-site'||q.get('origin')&&q.get('origin')!==origin||!q.is('application/json'))return void r.sendStatus(403);n()};
 const handle=(action:string):RequestHandler=>async(q,r)=>{
  const day=action==='claim'?q.body?.day:null;
  if(action!=='state'&&(!q.body||typeof q.body!=='object'||Array.isArray(q.body))||action==='claim'&&(Object.keys(q.body).length!==1||!Number.isInteger(day)||day<1||day>31)||action==='buy'&&Object.keys(q.body).length!==0)return void r.status(400).json({error:'invalid_request'});
  const {data,error}=await db.rpc('rewards_advent_2026',{p_actor:r.locals.session.twitchUserId,p_action:action,p_day:day});
  if(error){const reason=['invalid_request','advent_unavailable','sale_closed','insufficient_coins','purchase_required','day_closed','user_unavailable'].find(x=>error.message===x);return void r.status(reason==='user_unavailable'?403:reason?409:503).json({error:reason||'advent_unavailable'})}
  r.json(data);
 };
 app.get('/advent',noStore,(_q,r)=>r.type('html').send(adventHtml.replace('</body>','<script src="/advent.js" defer></script></body>')));
 app.get('/advent.js',noStore,(_q,r)=>r.type('application/javascript').send(adventJs));
 app.get('/advent/medals/advent-pass-2026.webp',(_q,r)=>r.sendFile(resolve('assets','advent','advent-pass-2026.webp'),{maxAge:'1d'}));
 app.get('/api/me/advent',noStore,user,handle('state'));
 app.post('/api/me/advent/buy',noStore,user,sameOrigin,handle('buy'));
 app.post('/api/me/advent/claim',noStore,user,sameOrigin,handle('claim'));
 const collection:RequestHandler=async(q,r)=>{
  const item=q.method==='POST'?q.body?.item:null,active=q.method==='POST'?q.body?.active:null;
  if(q.method==='POST'&&(!q.body||Object.keys(q.body).length!==2||typeof item!=='string'||typeof active!=='boolean'||!['snowflake','winter_background','cold_blood','winter_frame','snowfall','winter_banner','gold_frame'].includes(item)))return void r.status(400).json({error:'invalid_request'});
  const {data,error}=await db.rpc('rewards_advent_collection',{p_actor:r.locals.session.twitchUserId,p_item:item,p_active:active});
  if(error)return void r.status(409).json({error:'collection_unavailable'});r.json(data);
 };
 app.get('/api/me/advent/collection',noStore,user,collection);
 app.post('/api/me/advent/collection',noStore,user,sameOrigin,collection);
}
