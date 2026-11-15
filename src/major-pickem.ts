import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { majorPickemPage, majorPickemScript } from './major-pickem-ui.js';

const known = new Set(['invalid_request','invalid_picks','user_unavailable','entry_closed','entry_required','stage_locked','insufficient_coins']);
const outcomes = ['3:0','3:1','3:2','1:3','2:3','0:3'];

export function installMajorPickem(app:Express,db:SupabaseClient,user:RequestHandler,origin:string) {
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
    res.json(data);
  };

  app.get('/predict/major-pickem',noStore,user,(_req,res) => res.send(majorPickemPage));
  app.get('/predict/major-pickem.js',noStore,(_req,res) => res.type('application/javascript').send(majorPickemScript));
  app.get('/api/me/major-pickem',noStore,user,rpc('state'));
  app.post('/api/me/major-pickem/enter',noStore,user,rpc('enter'));
  app.post('/api/me/major-pickem/save',noStore,user,rpc('save'));
}
