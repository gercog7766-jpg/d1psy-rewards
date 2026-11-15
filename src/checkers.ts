import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler, Response } from 'express';
import { initialCheckers, moveCheckers, type Position } from './checkers-rules.js';
import { checkersPage, checkersScript } from './checkers-ui.js';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const errors = new Set([
  'user_unavailable','room_not_found','room_closed','not_participant','invalid_stake',
  'invalid_skin','already_in_room','wrong_password','insufficient_coins','stale_move','not_your_turn',
]);

export function installCheckers(app: Express, db: SupabaseClient, user: RequestHandler, origin: string, secret: string) {
  const noStore: RequestHandler = (_req,res,next) => {res.set('Cache-Control','private, no-store');next()};
  const attempts = new Map<string,{count:number; until:number}>();
  function limit(key: string) {
    const now = Date.now();
    if (attempts.size > 2500) for (const [id,entry] of attempts) if (entry.until < now) attempts.delete(id);
    const entry = attempts.get(key);
    if (!entry || entry.until < now) attempts.set(key,{count:1,until:now+60_000});
    else if (++entry.count > 12) return true;
    return false;
  }
  function fail(res: Response, error: {message:string;code:string}) {
    const known = errors.has(error.message);
    if (!known) console.error('checkers_rpc',error.code);
    return res.status(known ? 409 : 503).json({error:known ? error.message : 'game_unavailable'});
  }

  app.get('/games/checkers',noStore,user,(_req,res) => res.send(checkersPage));
  app.get('/games/checkers.js',noStore,(_req,res) => res.type('application/javascript').send(checkersScript));
  app.get('/api/me/checkers',noStore,user,async (req,res) => {
    const room = req.query.room;
    if (room !== undefined && !uuid(room)) return res.sendStatus(400);
    const {data,error} = await db.rpc('rewards_checkers_state',{p_actor:res.locals.session.twitchUserId,p_room:room ?? null});
    return error ? fail(res,error) : res.json(data);
  });
  for (const action of ['create','join','move','leave','draw'] as const) {
    app.post('/api/me/checkers/:id/'+action,noStore,user,async (req,res) => {
      if (req.get('origin') !== origin || !req.is('application/json')) return res.sendStatus(403);
      if (!uuid(req.params.id)) return res.sendStatus(400);
      const id = req.params.id.toLowerCase();
      const actor = res.locals.session.twitchUserId;
      let details: Record<string,unknown> = {};
      if (action === 'create' || action === 'join') {
        const password = req.body?.password ?? '';
        const skin = req.body?.skin ?? null;
        if (typeof password !== 'string' || password.length > 64 ||
          (action === 'create' && password.length > 0 && password.length < 4) ||
          (skin !== null && !uuid(skin))) return res.status(400).json({error:'invalid_request'});
        if (limit(action+':'+actor)) return res.status(429).json({error:'too_many_attempts'});
        details = {skin,proof:password ? createHmac('sha256',secret).update('checkers:'+id+':'+password).digest('hex') : null};
        if (action === 'create') {
          const stake = req.body?.stake;
          if (!Number.isInteger(stake) || stake < 1 || stake > 100) return res.status(400).json({error:'invalid_stake'});
          Object.assign(details,{stake,position:initialCheckers()});
        }
      } else if (action === 'move') {
        const {from,to,revision} = req.body ?? {};
        if (![from,to].every(i => Number.isInteger(i) && i >= 0 && i < 64) || !Number.isSafeInteger(revision) || revision < 0)
          return res.status(400).json({error:'invalid_request'});
        const {data: player,error: playerError} = await db.from('rewards_users').select('id').eq('twitch_user_id',actor).maybeSingle();
        if (playerError) return fail(res,playerError);
        const {data: room,error} = await db.from('rewards_checkers_rooms').select('host_id,guest_id,status,position,revision').eq('id',id).maybeSingle();
        if (error) return fail(res,error);
        if (!room) return res.status(404).json({error:'room_not_found'});
        const side = player?.id === room.host_id ? 'w' : player?.id === room.guest_id ? 'b' : null;
        if (!side) return res.status(403).json({error:'not_participant'});
        if (room.status !== 'active') return res.status(409).json({error:'room_closed'});
        if (room.revision !== revision) return res.status(409).json({error:'stale_move'});
        const position = room.position as Position;
        if (side !== position.turn) return res.status(409).json({error:'not_your_turn'});
        const move = moveCheckers(position,from,to);
        if (!move) return res.status(409).json({error:'invalid_move'});
        details = {revision,position:move.position,won:move.winner === side,draw:move.draw};
      }
      const {data,error} = await db.rpc('rewards_checkers_action',{p_actor:actor,p_room:id,p_action:action,p_data:details});
      return error ? fail(res,error) : res.json(data);
    });
  }
  let expiring = false;
  const expire = async () => {
    if (expiring) return;
    expiring = true;
    try {
      const {error} = await db.rpc('rewards_checkers_expire');
      if (error && error.code !== 'PGRST202') console.error('checkers_expiry',error.code);
    } catch {
      console.error('checkers_expiry_unavailable');
    } finally {
      expiring = false;
    }
  };
  setInterval(expire,30_000).unref();
}
