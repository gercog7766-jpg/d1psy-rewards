import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { createClient } from '@supabase/supabase-js';


const STREAMER_DASHBOARD_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Streamer Dashboard — D1PSY Rewards</title>
<style>
:root{color-scheme:dark;font-family:system-ui,Arial,sans-serif;background:#0d111b;color:#f0f3fa}
body{max-width:1050px;margin:0 auto;padding:32px 18px}h1{font-size:28px}h2{font-size:18px}
p,.muted{color:#aeb8ca}button,input,select{font:inherit;padding:10px;border-radius:8px;border:1px solid #47536a;background:#10192b;color:#f0f3fa}button{cursor:pointer}button:disabled,input:disabled,select:disabled{opacity:.5;cursor:not-allowed}label{display:block;margin:12px 0}label input,label select{display:block;margin-top:5px;width:100%;max-width:300px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
section{background:#192132;border:1px solid #303c52;border-radius:14px;padding:20px;margin:12px 0}
strong{display:block;font-size:22px;margin:10px 0}a{color:#91b9ff}ul{padding-left:20px}
</style></head><body>
<p><a href="/account">← Личный кабинет</a></p>
<h1>Streamer Dashboard</h1>
<p>Панель вашего Twitch-канала. Настройки и управление розыгрышами. До завершения тестирования управление заблокировано.</p>
<p id="status" role="status">Загрузка данных…</p>
<div class="grid">
<section><h2>Канал</h2><strong id="channel">—</strong><p id="connection">—</p></section>
<section><h2>Розыгрыши</h2><strong id="giveaway">—</strong><p id="config">—</p></section>
<section><h2>Активный раунд</h2><strong id="round">—</strong><p id="progress">—</p></section>
</div>
<section><h2>Управление розыгрышами</h2>
<p id="controlNotice">Проверка доступа к управлению…</p>
<label>Режим <select id="mode" disabled><option value="time">По времени</option><option value="messages">По сообщениям</option></select></label>
<label>Интервал (сек.) <input id="interval" type="number" min="60" max="900" value="300" disabled></label>
<label>Порог сообщений <input id="threshold" type="number" min="50" max="200" value="100" disabled></label>
<button id="saveSettings" disabled>Сохранить настройки</button>
<button id="startRound" disabled>Запустить розыгрыш</button>
<button id="stopRound" disabled>Остановить розыгрыш</button>
<p id="actionStatus" role="status"></p>
</section>
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
 el('status').textContent='Данные загружены.';
 const canWrite=data.controlsEnabled===true && data.streamer.enabled && !data.streamer.isPrimary;
 el('controlNotice').textContent=canWrite?'Управление доступно для вашего канала.':'Управление пока отключено до завершения тестирования.';
 el('mode').value=data.settings?.mode||'time';
 el('interval').value=String(data.settings?.interval_seconds||300);
 el('threshold').value=String(data.settings?.message_threshold||100);
 for(const id of ['mode','interval','threshold','saveSettings','startRound','stopRound']){
   el(id).disabled=!canWrite;
 }
 if(canWrite){
   el('saveSettings').disabled=!!data.activeRound;
   el('startRound').disabled=!!data.activeRound;
   el('stopRound').disabled=!data.activeRound && !data.settings?.enabled;
 }
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
async function act(url,method,body){
 const status=el('actionStatus');
 status.textContent='Выполняется…';
 for(const id of ['saveSettings','startRound','stopRound'])el(id).disabled=true;
 try{
  const response=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'request_failed');
  status.textContent='Изменения сохранены. Обновление…';
  location.reload();
 }catch(error){status.textContent='Ошибка: '+error.message;for(const id of ['saveSettings','startRound','stopRound'])el(id).disabled=false;}
}
el('saveSettings').addEventListener('click',()=>act('/api/streamer/settings','PUT',{
 mode:el('mode').value,intervalSeconds:Number(el('interval').value),messageThreshold:Number(el('threshold').value)
}));
el('startRound').addEventListener('click',()=>act('/api/streamer/round/start','POST',{}));
el('stopRound').addEventListener('click',()=>{if(confirm('Остановить свой розыгрыш?'))act('/api/streamer/round/stop','POST',{});});
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
        controlsEnabled: process.env.MULTISTREAM_DB_ENABLED === 'true' && process.env.STREAMER_DASHBOARD_WRITES_ENABLED === 'true',
        settings: settingsResult.data,
        activeRound: roundResult.data,
        recentRounds: winsResult.data || []
      });
    } catch (error) {
      console.error('[STREAMER_DASHBOARD] read failed', error);
      return res.status(500).json({ error: 'streamer_dashboard_unavailable' });
    }
  });

  // Streamer-only configuration. Mutations are gated until multi-stream cutover.
  // The primary broadcaster continues using the existing Super Admin routes.
  app.put('/api/streamer/settings', requireUser, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (process.env.MULTISTREAM_DB_ENABLED !== 'true' ||
        process.env.STREAMER_DASHBOARD_WRITES_ENABLED !== 'true') {
      return res.status(503).json({ error: 'streamer_controls_not_enabled' });
    }
    const session = res.locals.session as Session | undefined;
    if (!session?.twitchUserId) return res.status(401).json({ error: 'authentication_required' });

    // Browser writes must originate from this application, not an unrelated site.
    const origin = req.get('origin');
    const host = req.get('host');
    const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
    if (!origin || !configuredOrigin || origin !== configuredOrigin || !host ||
        new URL(origin).host !== host) {
      return res.status(403).json({ error: 'invalid_origin' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(k => !['mode', 'intervalSeconds', 'messageThreshold'].includes(k))) {
      return res.status(400).json({ error: 'invalid_settings' });
    }
    const { mode, intervalSeconds, messageThreshold } = body;
    if ((mode !== 'time' && mode !== 'messages') ||
        !Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 900 ||
        !Number.isInteger(messageThreshold) || messageThreshold < 50 || messageThreshold > 200) {
      return res.status(400).json({ error: 'invalid_settings' });
    }

    try {
      const { data: streamer, error: streamerError } = await db
        .from('rewards_streamers').select('id,enabled,is_primary')
        .eq('twitch_broadcaster_id', session.twitchUserId).maybeSingle();
      if (streamerError) throw streamerError;
      if (!streamer || !streamer.enabled || streamer.is_primary) {
        return res.status(403).json({ error: 'streamer_access_required' });
      }
      const { data: active, error: roundError } = await db.from('rewards_rounds')
        .select('id').eq('streamer_id', streamer.id).eq('status', 'active').maybeSingle();
      if (roundError) throw roundError;
      if (active) return res.status(409).json({ error: 'active_round_settings_locked' });

      const { data, error } = await db.from('rewards_streamer_settings')
        .update({ mode, interval_seconds: intervalSeconds,
          message_threshold: messageThreshold, updated_at: new Date().toISOString() })
        .eq('streamer_id', streamer.id)
        .select('mode,interval_seconds,message_threshold').single();
      if (error) throw error;
      return res.json({ ok: true, settings: data });
    } catch (error) {
      console.error('[STREAMER_DASHBOARD] settings update failed', error);
      return res.status(500).json({ error: 'streamer_settings_update_failed' });
    }
  });


  // Scoped round controls. Both flags must be explicitly enabled after isolated testing.
  app.post('/api/streamer/round/:action', requireUser, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (process.env.MULTISTREAM_DB_ENABLED !== 'true' ||
        process.env.STREAMER_DASHBOARD_WRITES_ENABLED !== 'true') {
      return res.status(503).json({ error: 'streamer_controls_not_enabled' });
    }
    if (req.params.action !== 'start' && req.params.action !== 'stop') {
      return res.status(404).json({ error: 'unknown_action' });
    }
    const session = res.locals.session as Session | undefined;
    if (!session?.twitchUserId) return res.status(401).json({ error: 'authentication_required' });
    const origin = req.get('origin');
    const host = req.get('host');
    const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
    if (!origin || !configuredOrigin || origin !== configuredOrigin || !host ||
        new URL(origin).host !== host) {
      return res.status(403).json({ error: 'invalid_origin' });
    }
    if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body) ||
        Object.keys(req.body).length !== 0)) {
      return res.status(400).json({ error: 'unexpected_body' });
    }

    try {
      const { data: streamer, error: streamerError } = await db.from('rewards_streamers')
        .select('id,enabled,is_primary').eq('twitch_broadcaster_id', session.twitchUserId)
        .maybeSingle();
      if (streamerError) throw streamerError;
      if (!streamer?.enabled || streamer.is_primary) {
        return res.status(403).json({ error: 'streamer_access_required' });
      }
      const { data: settings, error: settingsError } = await db.from('rewards_streamer_settings')
        .select('enabled,mode,interval_seconds,message_threshold,twitch_connection_status')
        .eq('streamer_id', streamer.id).single();
      if (settingsError) throw settingsError;

      if (req.params.action === 'stop') {
        // Disable automatic next-round creation first. The active round is cancelled
        // only for the authenticated streamer, never globally.
        const { error: disableError } = await db.from('rewards_streamer_settings')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('streamer_id', streamer.id);
        if (disableError) throw disableError;
        const { data: cancelled, error: cancelError } = await db.from('rewards_rounds')
          .update({ status: 'cancelled', ended_at: new Date().toISOString(),
            completion_reason: 'manual_stop' })
          .eq('streamer_id', streamer.id).eq('status', 'active')
          .select('id');
        if (cancelError) throw cancelError;
        return res.json({ ok: true, cancelledRoundIds: (cancelled || []).map(r => r.id) });
      }

      if (settings.twitch_connection_status !== 'connected') {
        return res.status(409).json({ error: 'twitch_not_connected' });
      }
      const { data: active, error: activeError } = await db.from('rewards_rounds')
        .select('id').eq('streamer_id', streamer.id).eq('status', 'active').maybeSingle();
      if (activeError) throw activeError;
      if (active) return res.status(409).json({ error: 'round_already_active' });
      const { data: prizes, error: prizeError } = await db.from('rewards_prizes')
        .select('id').eq('status', 'available');
      if (prizeError) throw prizeError;
      if (!prizes?.length) return res.status(409).json({ error: 'no_available_prizes' });
      const prize = prizes[crypto.randomInt(prizes.length)];
      // Unique active-round index is the final concurrency guard.
      const { data: round, error: insertError } = await db.from('rewards_rounds')
        .insert({ streamer_id: streamer.id, status: 'active', mode: settings.mode,
          interval_seconds: settings.interval_seconds,
          message_threshold: settings.message_threshold, prize_id: prize.id })
        .select('id').single();
      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(409).json({ error: 'round_already_active' });
        }
        throw insertError;
      }
      const { error: enableError } = await db.from('rewards_streamer_settings')
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .eq('streamer_id', streamer.id);
      if (enableError) {
        // Do not leave an unintended active round when enabling the scheduler fails.
        await db.from('rewards_rounds').update({ status: 'cancelled',
          ended_at: new Date().toISOString(), completion_reason: 'start_failed' })
          .eq('id', round.id).eq('streamer_id', streamer.id).eq('status', 'active');
        throw enableError;
      }
      return res.status(201).json({ ok: true, roundId: round.id });
    } catch (error) {
      console.error('[STREAMER_DASHBOARD] round control failed', error);
      return res.status(500).json({ error: 'streamer_round_control_failed' });
    }
  });

}
