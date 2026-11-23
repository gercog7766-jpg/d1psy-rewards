import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { redButtonPage, redButtonScript } from './red-button-ui.js';

const uuid = (v:unknown) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const failures = new Set(['user_unavailable','round_closed','cooldown','already_holding','insufficient_coins','invalid_request','press_limit']);

export function installRedButton(app:Express,db:SupabaseClient,user:RequestHandler,origin:string) {
  const noStore:RequestHandler = (_req,res,next) => { res.set('Cache-Control','private, no-store'); next(); };
  const action = (press:boolean):RequestHandler => async (req,res) => {
    if (press && (req.get('origin') !== origin || !req.is('application/json'))) {
      res.sendStatus(403);
      return;
    }
    const {roundId,requestId} = req.body ?? {};
    if (press && (!uuid(roundId) || !uuid(requestId))) {
      res.status(400).json({error:'invalid_request'});
      return;
    }
    const {data,error} = await db.rpc('rewards_red_button',{
      p_actor:res.locals.session.twitchUserId,p_round:press ? roundId : null,p_request:press ? requestId : null
    });
    if (!error) { res.json(data); return; }
    if (!failures.has(error.message)) console.error('red_button_rpc',error.code);
    res.status(failures.has(error.message) ? 409 : 503)
      .json({error:failures.has(error.message) ? error.message : 'game_unavailable'});
  };
  app.get('/games/red-button',noStore,user,(_req,res) => res.send(redButtonPage));
  app.get('/games/red-button/button-v1.webp',(_req,res) =>
    res.type('webp').set('Cache-Control','public,max-age=31536000,immutable')
      .sendFile(resolve('assets/games/red-button/button-v1.webp')));
  app.get('/games/red-button.js',noStore,(_req,res) => res.type('application/javascript').send(redButtonScript));
  app.get('/api/me/red-button',noStore,user,action(false));
  app.post('/api/me/red-button',noStore,user,action(true));

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const {error} = await db.rpc('rewards_red_button_tick');
      if (error && error.code !== 'PGRST202') console.error('red_button_tick',error.code);
    } catch {
      console.error('red_button_tick_unavailable');
    } finally { busy = false; }
  }
  void tick();
  setInterval(tick,30_000).unref();
}
