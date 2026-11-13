import type {Express, RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';

export const activityLink = '<a id="notificationsLink" class="shoplink" href="/notifications">Уведомления</a><a id="messagesTopLink" class="shoplink" href="/community">Сообщения<span id="messagesUnreadDot" hidden></span></a>';

const styles = '<style>#messagesTopLink{position:relative}#messagesUnreadDot{position:absolute;right:4px;top:4px;width:8px;height:8px;border-radius:50%;background:#ff536e;box-shadow:0 0 0 2px #190e24}#messagesUnreadDot[hidden]{display:none!important}</style>';

export const activityNav = styles + '<script src="/activity.js" defer></script>';

const page = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Уведомления · Dropso</title><link rel="stylesheet" href="/social.css"><style>.feed{display:grid;gap:10px;list-style:none;padding:0}.feed li{padding:15px 18px;border:1px solid #57326f;border-radius:14px;background:#1c1227}.feed li[data-kind="outbid"]{border-color:#985275}.feed a{display:grid;gap:4px}.feed time{font-size:12px;color:#bba5c9}.feed p{margin:0;color:#e1d3eb}</style></head><body><main><nav><a href="/account">← На главную</a><a href="/community">Сообщения</a></nav><h1>Уведомления</h1><p id="activityStatus" role="status">Загрузка…</p><ul id="activityList" class="feed"></ul></main><script src="/activity.js" defer></script></body></html>';

const script = String.raw`
(() => {
  const list = document.getElementById('activityList');
  const link = document.getElementById('messagesTopLink');
  const dot = document.getElementById('messagesUnreadDot');
  const status = document.getElementById('activityStatus');
  const titles = {stream:'Стример начал эфир',drop:'Вы выиграли дроп',outbid:'Ваша ставка перебита'};
  const dates = new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'});
  let loading = false;

  async function refresh() {
    if (document.hidden || loading || (!list && !dot)) return;
    loading = true;
    try {
      const response = await fetch(list ? '/api/me/activity' : '/api/me/social/summary',{cache:'no-store'});
      if (!response.ok) throw Error('load_failed');
      const data = await response.json();
      if (dot) {
        dot.hidden = !(data.unread > 0);
        link.setAttribute('aria-label',dot.hidden ? 'Сообщения' : 'Сообщения, есть непрочитанные');
      }
      if (!list) return;
      list.replaceChildren(...data.map(item => {
        const row = document.createElement('li');
        row.dataset.kind = item.kind;
        const a = document.createElement('a');
        a.href = item.kind === 'stream' ? '/streamers' : item.kind === 'outbid' ? '/black-box' : '/account';
        const title = document.createElement('strong');
        title.textContent = titles[item.kind];
        const detail = document.createElement('p');
        detail.textContent = item.kind === 'outbid' ? 'Чёрный ящик. Возвращено ' + item.detail + ' мон.' : item.detail;
        const time = document.createElement('time');
        time.dateTime = item.at;
        time.textContent = dates.format(new Date(item.at));
        a.append(title,detail,time);
        row.append(a);
        return row;
      }));
      status.textContent = data.length ? '' : 'Пока нет уведомлений.';
    } catch {
      if (status) status.textContent = 'Не удалось обновить уведомления.';
    } finally {
      loading = false;
    }
  }
  void refresh();
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,list ? 15000 : 20000);
})();
`;

export function installActivityFeed(app: Express, db: SupabaseClient, user: RequestHandler) {
  app.get('/notifications',user,(_req,res)=>res.set('Cache-Control','no-store').send(page));
  app.get('/activity.js',(_req,res)=>res.type('application/javascript').set('Cache-Control','no-cache').send(script));
  app.get('/api/me/activity',user,async(_req,res)=>{
    res.set('Cache-Control','no-store');
    const {data: account,error: lookup} = await db.from('rewards_users').select('id,banned')
      .eq('twitch_user_id',res.locals.session.twitchUserId).maybeSingle();
    if (lookup) return res.status(503).json({error:'unavailable'});
    if (!account || account.banned) return res.sendStatus(403);
    const {data,error} = await db.rpc('rewards_activity_feed',{p_user:account.id});
    if (error) return res.status(503).json({error:'unavailable'});
    return res.json(data);
  });
}
