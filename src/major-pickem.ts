import { resolve } from 'node:path';
import { majorPickemAdminPage, majorPickemAdminPath, type MajorPickemEntrant } from './major-pickem-admin.js';
import { majorMedals } from './major-medals.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { majorPickemPage, majorPickemScript } from './major-pickem-ui.js';

const known = new Set(['invalid_request','invalid_picks','user_unavailable','entry_closed','entry_required','stage_locked','insufficient_coins']);
const outcomes = ['3:0','3:1','3:2','1:3','2:3','0:3'];

export function installMajorPickem(app:Express,db:SupabaseClient,user:RequestHandler,admin:RequestHandler,origin:string) {
  const noStore:RequestHandler = (_req,res,next) => {res.set('Cache-Control','private, no-store');next()};
  const rpc = (action:'state'|'enter'|'save'):RequestHandler => async(req,res) => {
    if (action!=='state' && (req.get('origin')!==origin || !req.is('application/json'))) {
      res.sendStatus(403);
      return;
    }
    const body = req.body ?? {};
    if (action==='save') {
      const p = body.selections;
      if (![1,2,3].includes(body.stage) || !p || typeof p!=='object' || Array.isArray(p) ||
          Object.entries(p).length!==16 ||
          !Object.entries(p).every(([team,value]) => /^[a-z0-9-]{1,40}$/.test(team) && outcomes.includes(String(value)))) {
        res.status(400).json({error:'invalid_picks'});
        return;
      }
    }
    const {data,error} = await db.rpc('rewards_major_pickem',{
      p_actor:res.locals.session.twitchUserId,p_action:action,
      p_stage:action==='save' ? body.stage : null,p_selections:action==='save' ? body.selections : null,
    });
    if (error) {
      if (!known.has(error.message)) console.error('major_pickem_rpc',error.code);
      res.status(known.has(error.message) ? 409 : 503)
        .json({error:known.has(error.message) ? error.message : 'pickem_unavailable'});
      return;
    }
    res.json({...data,draftKey:res.locals.session.twitchUserId});
  };

  app.get('/predict/major-pickem',noStore,user,(_req,res) => res.send(majorPickemPage));
  app.get('/predict/major-pickem.js',noStore,(_req,res) => res.type('application/javascript').send(majorPickemScript));
  app.get('/predict/major-token.webp', (_req,res) => {
    res.sendFile(resolve(process.cwd(),'assets/major-pickem/token.webp'),{maxAge:'1d'});
  });
  app.get('/predict/major-medals/:file', (req,res) => {
    const medal=majorMedals.find(item=>item?.image===req.path);
    if(!medal){res.sendStatus(404);return;}
    res.sendFile(resolve(process.cwd(),'assets/major-medals',req.params.file),{maxAge:'1d'});
  });
  app.get('/api/me/major-medal',noStore,user,async(_req,res) => {
    const {data:player,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',res.locals.session.twitchUserId).maybeSingle();
    if(error){res.sendStatus(503);return;}
    if(!player){res.json({medal:null});return;}
    const {data:entry,error:entryError}=await db.from('rewards_major_pickem_entries').select('medal').eq('user_id',player.id).maybeSingle();
    if(entryError){res.sendStatus(503);return;}
    res.json({medal:majorMedals[entry?.medal ?? 0] ?? null});
  });
  app.get(majorPickemAdminPath,noStore,admin,async(req,res) => {
    const requestedPage=req.query.page ?? '1';
    if(typeof requestedPage!=='string' || !/^[1-9]\d{0,5}$/.test(requestedPage)){
      res.status(400).send('Неверная страница.');
      return;
    }
    const page=Number(requestedPage), pageSize=50, from=(page-1)*pageSize;
    const {data,error}=await db.from('rewards_major_pickem_entries')
      .select('paid,tokens,player:rewards_users!rewards_major_pickem_entries_user_id_fkey(twitch_login,twitch_display_name),picks:rewards_major_pickem_picks!rewards_major_pickem_picks_user_id_fkey(stage)')
      .order('entered_at',{ascending:false}).order('user_id')
      .range(from,from+pageSize).returns<MajorPickemEntrant[]>();
    if(error){
      console.error('major_pickem_admin_entries',error.code);
      res.status(503).send('Не удалось загрузить участников Major Pick’em.');
      return;
    }
    res.send(majorPickemAdminPage(data.slice(0,pageSize),page,data.length>pageSize));
  });
  app.post('/api/admin/major-pickem/settle',noStore,admin,async(req,res) => {
    if(req.get('origin')!==origin || !req.is('application/json')){res.sendStatus(403);return;}
    const {stage,results}=req.body ?? {};
    if(![1,2,3,4].includes(stage) || !results || typeof results!=='object' || Array.isArray(results)){
      res.status(400).json({error:'invalid_results'});
      return;
    }
    const {data,error}=await db.rpc('rewards_major_pickem_settle',{p_stage:stage,p_results:results});
    if(error){
      const known=['stage_unavailable','stage_already_settled','invalid_results'].includes(error.message);
      if(!known)console.error('major_pickem_settle',error.code);
      res.status(known?409:503).json({error:known?error.message:'pickem_unavailable'});
      return;
    }
    res.json({settled:data});
  });
  app.post('/api/me/major-pickem/shop/buy',noStore,user,async(req,res) => {
    if(req.get('origin')!==origin || !req.is('application/json')){res.sendStatus(403);return;}
    const {requestId,itemIndex}=req.body??{};
    if(!req.body || Object.keys(req.body).length!==2 ||
       typeof requestId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId) ||
       !Number.isInteger(itemIndex) || itemIndex<0 || itemIndex>8){
      res.status(400).json({error:'invalid_request'});return;
    }
    const {data,error}=await db.rpc('rewards_major_shop_buy',{
      p_actor:res.locals.session.twitchUserId,p_request:requestId,p_item:itemIndex
    });
    if(error){
      const reason=['invalid_request','user_unavailable','entry_required','insufficient_tokens','shop_item_unavailable'].find(x=>error.message.includes(x));
      if(!reason)console.error('major_shop_buy_failed',error.code);
      res.status(reason?409:503).json({error:reason||'shop_unavailable'});return;
    }
    res.json(data);
  });
  app.post('/api/me/major-pickem/cases/bronze/open',noStore,user,async(req,res) => {
    if(req.get('origin')!==origin || !req.is('application/json')){res.sendStatus(403);return;}
    const requestId=req.body?.requestId;
    if(!req.body || Object.keys(req.body).length!==1 ||
       typeof requestId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)){
      res.status(400).json({error:'invalid_request'});return;
    }
    const {data,error}=await db.rpc('rewards_major_bronze_open',{
      p_actor:res.locals.session.twitchUserId,p_request:requestId
    });
    if(error){
      const reason=['invalid_request','user_unavailable','entry_required','insufficient_tokens','case_prize_unavailable','case_catalog_incomplete'].find(x=>error.message.includes(x));
      if(!reason)console.error('major_bronze_open_failed',error.code);
      res.status(reason?409:503).json({error:reason||'case_unavailable'});return;
    }
    res.json(data);
  });
  app.get('/api/me/major-pickem',noStore,user,rpc('state'));
  app.post('/api/me/major-pickem/enter',noStore,user,rpc('enter'));
  app.post('/api/me/major-pickem/save',noStore,user,rpc('save'));
}
