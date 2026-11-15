import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { pickPage, pickScript } from './pick-ui.js';

const errors = new Set([
  'invalid_request', 'invalid_attempt', 'attempt_in_progress', 'quote_changed',
  'insufficient_coins', 'prize_unavailable', 'user_unavailable',
]);

export function installPick(app: Express, db: SupabaseClient, user: RequestHandler, origin: string) {
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  };
  app.get('/games/pick', noStore, user, (_req, res) => res.send(pickPage));
  app.get('/games/pick.js', noStore, (_req, res) => res.type('application/javascript').send(pickScript));

  const call = (action: 'state' | 'start' | 'reveal'): RequestHandler => async (req, res) => {
    const body = req.body;
    if (action !== 'state') {
      if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') {
        res.sendStatus(403);
        return;
      }
      const validId = typeof body?.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id);
      const values = action === 'start' ? [7, 10] : [1, 2, 3, 4, 5];
      if (!req.is('application/json') || !validId || !values.includes(body?.value)) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
    }
    const { data, error } = await db.rpc('rewards_pick', {
      p_actor: res.locals.session.twitchUserId, p_action: action,
      p_id: action === 'state' ? null : body.id,
      p_value: action === 'state' ? null : body.value,
    });
    if (error) {
      const known = errors.has(error.message);
      if (!known) console.error('pick_rpc', error.code);
      res.status(error.message === 'user_unavailable' ? 403 : known ? 409 : 503)
        .json({ error: known ? error.message : 'game_unavailable' });
      return;
    }
    res.json(data);
  };
  app.get('/api/me/pick', noStore, user, call('state'));
  app.post('/api/me/pick/start', noStore, user, call('start'));
  app.post('/api/me/pick/reveal', noStore, user, call('reveal'));
}
