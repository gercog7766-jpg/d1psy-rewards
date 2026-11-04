import type { Express, RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';

type Session = { twitchUserId: string; login: string; displayName: string; exp: number };

// Read-only initial dashboard. The caller supplies the existing, verified session middleware.
// Never trust a streamer ID or broadcaster ID supplied by the browser.
export function installStreamerDashboard(app: Express, requireUser: RequestHandler) {
  const db = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '', {
    auth: { persistSession: false }
  });

  app.get('/api/streamer/dashboard', requireUser, async (_req, res) => {
    const session = res.locals.session as Session | undefined;
    if (!session?.twitchUserId) return res.status(401).json({ error: 'authentication_required' });

    try {
      const { data: streamer, error: streamerError } = await db
        .from('rewards_streamers')
        .select('id,twitch_broadcaster_id,twitch_login,display_name,enabled,is_primary')
        .eq('twitch_broadcaster_id', session.twitchUserId)
        .maybeSingle();
      if (streamerError) throw streamerError;
      if (!streamer) return res.status(403).json({ error: 'streamer_access_required' });

      const [settingsResult, roundResult, winsResult] = await Promise.all([
        db.from('rewards_streamer_settings')
          .select('enabled,mode,interval_seconds,message_threshold,twitch_connection_status')
          .eq('streamer_id', streamer.id).maybeSingle(),
        db.from('rewards_rounds')
          .select('id,status,mode,started_at,interval_seconds,message_threshold,message_count')
          .eq('streamer_id', streamer.id).eq('status', 'active').maybeSingle(),
        db.from('rewards_rounds')
          .select('id,status,started_at,ended_at,winner_user_id,prize_id')
          .eq('streamer_id', streamer.id).eq('status', 'completed')
          .order('ended_at', { ascending: false }).limit(10)
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (roundResult.error) throw roundResult.error;
      if (winsResult.error) throw winsResult.error;

      res.set('Cache-Control', 'private, no-store');
      return res.json({
        streamer: {
          login: streamer.twitch_login,
          displayName: streamer.display_name,
          enabled: streamer.enabled,
          isPrimary: streamer.is_primary
        },
        settings: settingsResult.data,
        activeRound: roundResult.data,
        recentRounds: winsResult.data || []
      });
    } catch (error) {
      console.error('[STREAMER_DASHBOARD] read failed', error);
      return res.status(500).json({ error: 'streamer_dashboard_unavailable' });
    }
  });
}
