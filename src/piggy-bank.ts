import { fileURLToPath } from 'node:url';
import type { Express, RequestHandler, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { piggyPage, piggyScript } from './piggy-bank-ui.js';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const known = new Set(['invalid_request', 'participation_restricted', 'insufficient_coins', 'day_closed']);

function validDay(day: unknown): day is string {
  if (typeof day !== 'string' || !dayPattern.test(day)) return false;
  const value = new Date(day + 'T00:00:00Z');
  return Number.isFinite(value.valueOf()) && value.toISOString().slice(0, 10) === day && day >= '2000-01-01';
}

export function installPiggyBank(app: Express, db: SupabaseClient, user: RequestHandler, admin: RequestHandler, origin: string) {
  const noStore: RequestHandler = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  function fail(res: Response, error: { message: string; code: string }) {
    if (known.has(error.message)) return res.status(409).json({ error: error.message });
    console.error('piggy_bank_db', error.code);
    return res.status(503).json({ error: 'unavailable' });
  }
  app.get('/piggy-bank', noStore, user, (_req, res) => res.send(piggyPage(false)));
  app.get('/admin/piggy-bank', noStore, admin, (_req, res) => res.send(piggyPage(true)));
  app.get('/piggy-bank/pig-v1.webp', (_req, res) => {
    res.set('Cache-Control', 'public,max-age=31536000,immutable');
    res.sendFile(fileURLToPath(new URL('../public/piggy-bank/pig-v1.webp', import.meta.url)));
  });
  app.get('/piggy-bank.js', noStore, (_req, res) => res.type('application/javascript').send(piggyScript));
  app.get('/api/piggy-bank', noStore, user, async (_req, res) => {
    const { data, error } = await db.rpc('rewards_piggy_state');
    return error ? fail(res, error) : res.json(data);
  });
  app.post('/api/piggy-bank/add', noStore, user, async (req, res) => {
    if (req.get('origin') !== origin || !req.is('application/json')) return res.status(403).json({ error: 'invalid_request' });
    const { day, amount, requestId } = req.body ?? {};
    if (!validDay(day) || typeof amount !== 'string' || !/^[1-9]\d{0,18}$/.test(amount) ||
        BigInt(amount) > 9223372036854775807n || typeof requestId !== 'string' || !uuidPattern.test(requestId)) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const { data, error: lookup } = await db.from('rewards_users').select('id').eq('twitch_user_id', res.locals.session.twitchUserId).maybeSingle();
    if (lookup) return fail(res, lookup);
    if (!data) return res.status(403).json({ error: 'participation_restricted' });
    const { error } = await db.rpc('rewards_piggy_add', {p_day: day, p_user: data.id, p_amount: amount, p_request: requestId});
    return error ? fail(res, error) : res.json({ ok: true });
  });
  app.get('/api/admin/piggy-bank', noStore, admin, async (req, res) => {
    let day = req.query.day;
    const offset = Number(req.query.offset ?? 0);
    if (day === undefined) {
      const { data, error } = await db.rpc('rewards_piggy_state');
      if (error) return fail(res, error);
      day = data.day;
    }
    if (!validDay(day) || !Number.isInteger(offset) || offset < 0 || offset > 10000000) return res.status(400).json({ error: 'invalid_request' });
    const { data, error } = await db.rpc('rewards_piggy_admin', {p_day: day, p_offset: offset});
    return error ? fail(res, error) : res.json(data);
  });
  let settling = false;
  setInterval(async () => {
    if (settling) return;
    settling = true;
    try {
      const { error } = await db.rpc('rewards_piggy_close');
      if (error && error.code !== 'PGRST202') console.error('piggy_bank_close', error.code, error.message);
    } catch (error) {
      console.error('piggy_bank_close', error);
    } finally {
      settling = false;
    }
  }, 5000).unref();
}
