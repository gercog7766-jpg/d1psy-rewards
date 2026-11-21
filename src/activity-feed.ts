import type {Express, RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {achievementMedal} from './achievement-medals.js';

export const activityLink = '<a id="notificationsLink" class="shoplink" href="/notifications">Уведомления</a><a id="messagesTopLink" class="shoplink" href="/community">Сообщения<span id="messagesUnreadDot" hidden></span></a>';

const styles = '<style>#messagesTopLink{position:relative}#messagesUnreadDot{position:absolute;right:4px;top:4px;width:8px;height:8px;border-radius:50%;background:#ff536e;box-shadow:0 0 0 2px #190e24}#messagesUnreadDot[hidden]{display:none!important}#achievementToastStack{position:fixed;z-index:12000;right:16px;top:16px;width:min(360px,calc(100vw - 32px));display:grid;gap:8px;pointer-events:none}.achievement-toast{pointer-events:auto;display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #bd71f5;border-radius:13px;background:linear-gradient(135deg,#35204e,#160e26);color:#fff;box-shadow:0 8px 24px #0007;font:14px/1.4 system-ui;text-decoration:none!important}.achievement-toast img{width:48px;height:48px;object-fit:contain;flex:none}.achievement-toast strong,.achievement-toast small{display:block}.achievement-toast small{color:#d1b7e9}.achievement-toast b{color:#e7bcff}</style>';

export const activityNav = styles + '<script src="/activity.js" defer></script>';

const page = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Уведомления · Dropso</title><link rel="stylesheet" href="/social.css"><style>.feed{display:grid;gap:10px;list-style:none;padding:0}.feed li{padding:15px 18px;border:1px solid #57326f;border-radius:14px;background:#1c1227}.feed li[data-kind="outbid"]{border-color:#985275}.feed a{display:grid;gap:4px}.feed time{font-size:12px;color:#bba5c9}.feed p{margin:0;color:#e1d3eb}</style></head><body><main><nav><a href="/account">← На главную</a><a href="/community">Сообщения</a></nav><h1>Уведомления</h1><p id="activityStatus" role="status">Загрузка…</p><ul id="activityList" class="feed"></ul></main><script src="/activity.js" defer></script></body></html>';

const script = String.raw`
(() => {
  const list = document.getElementById('activityList');
  const link = document.getElementById('messagesTopLink');
  const dot = document.getElementById('messagesUnreadDot');
  const status = document.getElementById('activityStatus');
  const titles = {stream:'Стример начал эфир',drop:'Вы выиграли дроп',outbid:'Ваша ставка перебита',achievement:'Вы получили достижение'};
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
        a.href = item.kind === 'stream' ? '/streamers' : item.kind === 'outbid' ? '/black-box' : item.kind === 'achievement' && /^\/users\/[a-z0-9_]+$/i.test(item.href||'') ? item.href : '/account';
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
  let noticesLoading=false;
  const displayed=new Set();
  async function achievements(){
    if(document.hidden||noticesLoading||!dot)return;
    noticesLoading=true;
    try{
      const r=await fetch('/api/me/achievement-notifications',{cache:'no-store'});if(!r.ok)return;
      const items=await r.json();if(!Array.isArray(items)||!items.length)return;
      let stack=document.getElementById('achievementToastStack');if(!stack){stack=document.createElement('div');stack.id='achievementToastStack';stack.setAttribute('aria-live','polite');document.body.append(stack)}
      const ids=[];
      for(const m of items){
        if(displayed.has(m.id)){ids.push(m.id);continue}
        if(!/^\/live-boss\/\d+\.webp$/.test(m.image||''))continue;
        const a=document.createElement('a');a.className='achievement-toast';a.href=/^\/users\/[a-z0-9_]+$/i.test(m.href||'')?m.href:'/account';
        const img=document.createElement('img');img.src=m.image;img.alt='';const details=document.createElement('div'),label=document.createElement('strong'),name=document.createElement('b'),description=document.createElement('small');
        label.textContent='Вы получили достижение!';name.textContent=m.title;description.textContent=m.description;details.append(label,name,description);a.append(img,details);stack.append(a);
        displayed.add(m.id);ids.push(m.id);setTimeout(()=>a.remove(),10000);
      }
      if(ids.length)await fetch('/api/me/achievement-notifications/seen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    }catch{}finally{noticesLoading=false}
  }
  void achievements();setInterval(achievements,20000);
  window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,list ? 15000 : 20000);
})();
`;

export function installActivityFeed(app: Express, db: SupabaseClient, user: RequestHandler) {
  async function account(res:any){const {data,error}=await db.from('rewards_users').select('id,banned,twitch_login').eq('twitch_user_id',res.locals.session.twitchUserId).maybeSingle();if(error){res.status(503).json({error:'unavailable'});return null}if(!data||data.banned){res.sendStatus(403);return null}return data}
  const profileLink=(login:unknown)=>typeof login==='string'&&/^[a-z0-9_]{1,25}$/i.test(login)?'/users/'+login:'/account';
  const noticeDto=(row:any,login:unknown)=>{const m=achievementMedal(row.category,row.tier);return m?{...m,id:row.id,at:row.earned_at,href:profileLink(login)}:null};
  app.get('/api/me/achievement-notifications',user,async(_req,res)=>{res.set('Cache-Control','no-store');const u=await account(res);if(!u)return;const {data,error}=await db.from('rewards_achievement_notifications').select('id,category,tier,earned_at').eq('user_id',u.id).is('seen_at',null).order('earned_at').limit(12);if(error)return void res.status(503).json({error:'unavailable'});res.json((data||[]).map(row=>noticeDto(row,u.twitch_login)).filter(Boolean))});
  app.post('/api/me/achievement-notifications/seen',user,async(req,res)=>{res.set('Cache-Control','no-store');const ids=req.body?.ids;if(req.get('sec-fetch-site')==='cross-site'||!req.is('application/json')||req.get('origin')&&req.get('origin')!==new URL(process.env.APP_URL||'http://localhost:'+String(process.env.PORT||10000)).origin)return void res.sendStatus(403);if(!Array.isArray(ids)||ids.length<1||ids.length>12||ids.some(x=>typeof x!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)))return void res.sendStatus(400);const u=await account(res);if(!u)return;const {error}=await db.from('rewards_achievement_notifications').update({seen_at:new Date().toISOString()}).eq('user_id',u.id).is('seen_at',null).in('id',ids);if(error)return void res.status(503).json({error:'unavailable'});res.json({ok:true})});
  app.get('/notifications',user,(_req,res)=>res.set('Cache-Control','no-store').send(page));
  app.get('/activity.js',(_req,res)=>res.type('application/javascript').set('Cache-Control','no-cache').send(script));
  app.get('/api/me/activity',user,async(_req,res)=>{
    res.set('Cache-Control','no-store');
    const {data: account,error: lookup} = await db.from('rewards_users').select('id,banned,twitch_login')
      .eq('twitch_user_id',res.locals.session.twitchUserId).maybeSingle();
    if (lookup) return res.status(503).json({error:'unavailable'});
    if (!account || account.banned) return res.sendStatus(403);
    const {data,error} = await db.rpc('rewards_activity_feed',{p_user:account.id});
    if (error) return res.status(503).json({error:'unavailable'});
    const notices=await db.from('rewards_achievement_notifications').select('id,category,tier,earned_at').eq('user_id',account.id).order('earned_at',{ascending:false}).limit(12);
    const adds=(notices.data||[]).flatMap(row=>{const m=noticeDto(row,account.twitch_login);return m?[{kind:'achievement',detail:m.title+' — '+m.description,at:m.at,href:m.href}]:[]});
    return res.json([...(Array.isArray(data)?data:[]),...adds].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,50));
  });
}
