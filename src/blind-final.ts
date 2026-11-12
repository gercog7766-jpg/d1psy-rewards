import type { Express, RequestHandler, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { blindPage, blindScript } from './blind-final-ui.js';

const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const knownErrors = new Set(['invalid_request', 'round_active', 'unknown_prize', 'round_closed',
  'participation_restricted', 'insufficient_coins', 'entry_required', 'number_locked']);

export function installBlindFinal(app: Express, db: SupabaseClient, user: RequestHandler, admin: RequestHandler, origin: string) {
  const noStore: RequestHandler = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const write: RequestHandler = (req, res, next) => {
    if (req.get('origin') !== origin || !req.is('application/json')) {
      res.status(403).json({ error: 'invalid_request' });
      return;
    }
    next();
  };
  function errorResponse(res: Response, error: { code: string; message: string }) {
    if (knownErrors.has(error.message)) return res.status(409).json({ error: error.message });
    if (error.code === '23505' && error.message.includes('rewards_blind_one_open')) return res.status(409).json({ error: 'round_active' });
    console.error('blind_final_db', error.code);
    return res.status(503).json({ error: 'unavailable' });
  }
  async function account(res: Response) {
    const { data, error } = await db.from('rewards_users').select('id').eq('twitch_user_id', res.locals.session.twitchUserId).maybeSingle();
    if (error) { errorResponse(res, error); return null; }
    if (!data) { res.status(403).json({ error: 'participation_restricted' }); return null; }
    return data.id;
  }

  app.get('/games/blind-final', noStore, user, (_req, res) => res.send(blindPage(false)));
  app.get('/admin/blind-final', noStore, admin, (_req, res) => res.send(blindPage(true)));
  app.get('/games/blind-final.js', noStore, (_req, res) => res.type('application/javascript').send(blindScript));
  app.get('/api/blind-final', noStore, user, async (_req, res) => {
    const id = await account(res);
    if (!id) return;
    const { data, error } = await db.rpc('rewards_blind_state', { p_user: id });
    return error ? errorResponse(res, error) : res.json(data);
  });
  app.post('/api/blind-final/:action', noStore, user, write, async (req, res) => {
    const { id, number } = req.body ?? {};
    const action = req.params.action;
    if (!uuid(id) || !(action === 'enter' && number === undefined || action === 'pick' && integer(number, 0, 9999))) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const actor = await account(res);
    if (!actor) return;
    const { error } = await db.rpc('rewards_blind_play', { p_round: id, p_user: actor, p_number: number ?? null });
    return error ? errorResponse(res, error) : res.json({ ok: true });
  });

  app.get('/api/admin/blind-final/prizes', noStore, admin, async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    let query = db.from('rewards_prizes').select('id,name,sell_price_coins').order('name').limit(100);
    if (term) query = query.ilike('name', '%' + term.replace(/[\\%_]/g, '\\$&') + '%');
    const { data, error } = await query;
    return error ? errorResponse(res, error) : res.json(data);
  });
  app.get('/api/admin/blind-final/rounds', noStore, admin, async (req, res) => {
    const page = Number(req.query.page ?? 0);
    if (!integer(page, 0, 100000)) return res.status(400).json({ error: 'invalid_request' });
    const { data, error } = await db.from('rewards_blind_rounds')
      .select('id,starts_at,ends_at,status,entry_fee,low_number,high_number,rewards_prizes(name)')
      .order('starts_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19);
    return error ? errorResponse(res, error) : res.json(data);
  });
  app.get('/api/admin/blind-final/rounds/:id', noStore, admin, async (req, res) => {
    const page = Number(req.query.page ?? 0);
    if (!uuid(req.params.id) || !integer(page, 0, 100000)) return res.status(400).json({ error: 'invalid_request' });
    const { data: round, error: roundError } = await db.from('rewards_blind_rounds').select('entry_fee,winner_id')
      .eq('id', req.params.id).maybeSingle();
    if (roundError) return errorResponse(res, roundError);
    if (!round) return res.status(404).json({ error: 'round_not_found' });
    const { data, error } = await db.from('rewards_blind_entries')
      .select('number,user_id,rewards_users(twitch_login,twitch_display_name)')
      .eq('round_id', req.params.id).order('number', { nullsFirst: false }).order('user_id').range(page * 100, page * 100 + 99);
    if (error) return errorResponse(res, error);
    return res.json(data.map(row => ({ ...row, entry_fee: round.entry_fee, won: row.user_id === round.winner_id })));
  });
  app.post('/api/admin/blind-final/:action', noStore, admin, write, async (req, res) => {
    if (req.params.action === 'cancel' && uuid(req.body?.id)) {
      const { error } = await db.rpc('rewards_blind_finish', { p_cancel: req.body.id });
      return error ? errorResponse(res, error) : res.json({ ok: true });
    }
    const { prize, minutes, low, high, fee } = req.body ?? {};
    if (req.params.action !== 'start' || !uuid(prize) || !integer(minutes, 1, 10080) ||
        !integer(low, 0, 9999) || !integer(high, low + 1, Math.min(low + 499, 9999)) || !integer(fee, 0, 1000000)) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const { error } = await db.rpc('rewards_blind_start', { p_prize: prize, p_minutes: minutes, p_low: low, p_high: high, p_fee: fee });
    return error ? errorResponse(res, error) : res.json({ ok: true });
  });

  let settling = false;
  setInterval(async () => {
    if (settling) return;
    settling = true;
    try {
      const { error } = await db.rpc('rewards_blind_finish', { p_cancel: null });
      if (error && error.code !== 'PGRST202') console.error('blind_final_finish', error.code, error.message);
    } catch (error) {
      console.error('blind_final_finish', error);
    } finally {
      settling = false;
    }
  }, 5000).unref();
}
