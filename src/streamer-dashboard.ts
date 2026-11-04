import type { Express, RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';


const STREAMER_DASHBOARD_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Streamer Dashboard — D1PSY Rewards</title>
<style>
:root{color-scheme:dark;font-family:system-ui,Arial,sans-serif;background:#0d111b;color:#f0f3fa}
body{max-width:1050px;margin:0 auto;padding:32px 18px}h1{font-size:28px}h2{font-size:18px}
p,.muted{color:#aeb8ca}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
section{background:#192132;border:1px solid #303c52;border-radius:14px;padding:20px;margin:12px 0}
strong{display:block;font-size:22px;margin:10px 0}a{color:#91b9ff}ul{padding-left:20px}
</style></head><body>
<p><a href="/account">← Личный кабинет</a></p>
<h1>Streamer Dashboard</h1>
<p>Панель вашего Twitch-канала. Управление розыгрышами появится после проверки безопасности.</p>
<p id="status" role="status">Загрузка данных…</p>
<div class="grid">
<section><h2>Канал</h2><strong id="channel">—</strong><p id="connection">—</p></section>
<section><h2>Розыгрыши</h2><strong id="giveaway">—</strong><p id="config">—</p></section>
<section><h2>Активный раунд</h2><strong id="round">—</strong><p id="progress">—</p></section>
</div>
<section><h2>Последние завершённые раунды</h2><ul id="history"><li>Нет данных</li></ul></section>
<script>
(async function(){
const el=id=>document.getElementById(id);
try{
 const response=await fetch('/api/streamer/dashboard',{credentials:'same-origin',cache:'no-store'});
 if(response.status===401){el('status').textContent='Необходимо войти через Twitch.';return;}
 if(response.status===403){el('status').textContent='У этого аккаунта нет доступа к панели стримера.';return;}
 if(!response.ok)throw Error('dashboard unavailable');
 const data=await response.json();
 el('status').textContent='Данные загружены. Режим просмотра.';
 el('channel').textContent=data.streamer.displayName||data.streamer.login;
 el('connection').textContent='Twitch: '+(data.settings?.twitch_connection_status||'не подключён');
 el('giveaway').textContent=data.settings?.enabled?'Включены':'Выключены';
 el('config').textContent=data.settings?.mode==='messages'
   ?'Порог сообщений: '+data.settings.message_threshold
   :'Интервал: '+(data.settings?.interval_seconds||'—')+' сек.';
 el('round').textContent=data.activeRound?'Активен':'Нет активного раунда';
 el('progress').textContent=data.activeRound
   ?'Сообщений: '+data.activeRound.message_count+'; начало: '+new Date(data.activeRound.started_at).toLocaleString('ru-RU')
   :'Ожидает запуска';
 const list=el('history');list.replaceChildren();
 for(const round of data.recentRounds||[]){
   const li=document.createElement('li');
   li.textContent=new Date(round.ended_at||round.started_at).toLocaleString('ru-RU')+' — '+round.status;
   list.appendChild(li);
 }
 if(!list.children.length){const li=document.createElement('li');li.textContent='Нет завершённых раундов';list.appendChild(li);}
}catch(e){el('status').textContent='Не удалось загрузить данные панели. Попробуйте позже.';}
})();
</script></body></html>`;

type Session = { twitchUserId: string; login: string; displayName: string; exp: number };

// Read-only initial dashboard. The caller supplies the existing, verified session middleware.
// Never trust a streamer ID or broadcaster ID supplied by the browser.
export function installStreamerDashboard(app: Express, requireUser: RequestHandler) {
  const db = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || '', {
    auth: { persistSession: false }
  });


  // The dashboard is intentionally read-only until scoped mutations and cutover tests are ready.
  app.get('/streamer/dashboard', requireUser, (_req, res) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff'
    });
    res.type('html').send(STREAMER_DASHBOARD_HTML);
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
