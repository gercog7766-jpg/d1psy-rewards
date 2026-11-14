import { fileURLToPath } from 'node:url';
import type { Express, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { blackBoxPage, blackBoxScript } from './black-box-ui.js';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const coins = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1_000_000_000;

export function installBlackBox(app: Express, db: SupabaseClient, user: RequestHandler, admin: RequestHandler, origin: string) {
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (req.get('origin') !== origin || !req.is('application/json')) {
      res.status(403).json({ error: 'invalid_request' });
      return;
    }
    next();
  };
  const known = new Set(['auction_open', 'unknown_prize', 'auction_closed', 'bid_too_low', 'insufficient_coins', 'participation_restricted', 'invalid_message', 'chat_rate_limit']);
  function failure(error: { message: string; code: string }) {
    if (known.has(error.message)) return error.message;
    if (error.code === '23505' && error.message.includes('rewards_black_boxes_one_open')) return 'auction_open';
    console.error('black_box_rpc', error.code, error.message);
    return 'unavailable';
  }

  app.get('/black-box', noStore, (_req, res) => res.send(blackBoxPage(false)));
  app.get('/admin/black-box', noStore, admin, (_req, res) => res.send(blackBoxPage(true)));
  app.get('/black-box/case.jpg', (_req, res) => {
    res.sendFile(fileURLToPath(new URL('../public/black-box/dropso-case.jpg', import.meta.url)));
  });
  app.get('/black-box.js', noStore, (_req, res) => res.type('application/javascript').send(blackBoxScript));

  app.get('/api/black-box', noStore, async (_req, res) => {
    const { data, error } = await db.rpc('rewards_black_box_state');
    if (error) return res.status(503).json({ error: failure(error) });
    return res.json(data);
  });
  app.get('/api/black-box/chat/:id', noStore, async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ error: 'invalid_request' });
    const { data, error } = await db.rpc('rewards_black_box_chat_read', { p_box: req.params.id });
    if (error) return res.status(503).json({ error: failure(error) });
    return res.json({ messages: data });
  });
  app.post('/api/black-box/chat/:id', noStore, user, sameOrigin, async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ error: 'invalid_request' });
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 280 || Array.from(message).length > 140 || /[\u0000-\u001f\u007f]/.test(message)) {
      return res.status(400).json({ error: 'invalid_message' });
    }
    const { error } = await db.rpc('rewards_black_box_chat_send', {
      p_box: req.params.id,
      p_twitch_user: res.locals.session.twitchUserId,
      p_message: message
    });
    if (error) {
      const code = failure(error);
      const status = { invalid_message: 400, participation_restricted: 403, auction_closed: 409, chat_rate_limit: 429 }[code] ?? 503;
      return res.status(status).json({ error: code });
    }
    return res.json({ ok: true });
  });
  app.delete('/api/admin/black-box/chat/:box/:id', noStore, admin, async (req, res) => {
    if (req.get('origin') !== origin) return res.sendStatus(403);
    const { box, id } = req.params;
    if (!uuid(box) || typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
      return res.sendStatus(400);
    }
    const { error } = await db.from('rewards_black_box_chat').delete().eq('box_id', box).eq('id', id);
    return res.sendStatus(error ? 503 : 204);
  });
  app.get('/api/admin/black-box/prizes', noStore, admin, async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    let query = db.from('rewards_prizes').select('id,name,sell_price_coins').order('name').limit(100);
    if (term) query = query.ilike('name', '%' + term.replace(/[\\%_]/g, '\\$&') + '%');
    const { data, error } = await query;
    if (error) return res.status(503).json({ error: 'unavailable' });
    return res.json(data);
  });
  app.post('/api/admin/black-box', noStore, admin, sameOrigin, async (req, res) => {
    const { start, step, hint, prizeId, prizeCoins } = req.body ?? {};
    if (!coins(start) || !coins(step) || typeof hint !== 'string' || hint.length > 400 ||
        !(uuid(prizeId) && prizeCoins == null || prizeId == null && coins(prizeCoins))) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const { error } = await db.rpc('rewards_black_box_create', {
      p_start: start, p_step: step, p_hint: hint, p_prize: prizeId, p_coins: prizeCoins
    });
    if (error) return res.status(409).json({ error: failure(error) });
    return res.json({ ok: true });
  });
  app.post('/api/black-box/bid', noStore, user, sameOrigin, async (req, res) => {
    const { id, amount } = req.body ?? {};
    if (!uuid(id) || !coins(amount)) return res.status(400).json({ error: 'invalid_request' });
    const { data, error: lookupError } = await db.from('rewards_users').select('id')
      .eq('twitch_user_id', res.locals.session.twitchUserId).single();
    if (lookupError || !data) return res.status(403).json({ error: 'participation_restricted' });
    const { error } = await db.rpc('rewards_black_box_bid', { p_box: id, p_user: data.id, p_amount: amount });
    if (error) return res.status(409).json({ error: failure(error) });
    return res.json({ ok: true });
  });

  let settling = false;
  setInterval(async () => {
    if (settling) return;
    settling = true;
    try {
      const { error } = await db.rpc('rewards_black_box_close');
      if (error && error.code !== 'PGRST202') failure(error);
    } catch (error) {
      console.error('black_box_settlement', error);
    } finally {
      settling = false;
    }
  }, 5000).unref();
}
