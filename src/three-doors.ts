import type { SupabaseClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { threeDoorsPage, threeDoorsScript } from './three-doors-ui.js';

const stakes = [15, 25, 50, 75, 100, 150, 250];
const errors = new Set([
  'invalid_request', 'invalid_attempt', 'attempt_in_progress', 'cooldown',
  'insufficient_coins', 'prize_unavailable', 'user_unavailable',
]);

export function installThreeDoors(app: Express, db: SupabaseClient, user: RequestHandler, origin: string) {
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  };
  app.get('/games/three-doors', noStore, user, (_req, res) => res.send(threeDoorsPage(stakes)));
  app.get('/games/three-doors.js', noStore, (_req, res) => res.type('application/javascript').send(threeDoorsScript));

  const call = (action: 'state' | 'start' | 'pick' | 'finish'): RequestHandler => async (req, res) => {
    const body = req.body;
    if (action !== 'state') {
      if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') {
        res.sendStatus(403);
        return;
      }
      const validId = typeof body?.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id);
      const validChoice = action === 'start' ? stakes.includes(body?.stake) : [1, 2, 3].includes(body?.door);
      if (!req.is('application/json') || !validId || !validChoice) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
    }
    const { data, error } = await db.rpc('rewards_three_doors', {
      p_actor: res.locals.session.twitchUserId, p_action: action,
      p_attempt: action === 'state' ? null : body.id,
      p_stake: action === 'start' ? body.stake : null,
      p_door: action === 'pick' || action === 'finish' ? body.door : null,
    });
    if (error) {
      const known = errors.has(error.message);
      if (!known) console.error('three_doors_rpc', error.code);
      res.status(error.message === 'user_unavailable' ? 403 : known ? 409 : 503)
        .json({ error: known ? error.message : 'game_unavailable' });
      return;
    }
    res.json(data);
  };

  app.get('/api/me/three-doors', noStore, user, call('state'));
  for (const action of ['start', 'pick', 'finish'] as const) {
    app.post('/api/me/three-doors/' + action, noStore, user, call(action));
  }
}
