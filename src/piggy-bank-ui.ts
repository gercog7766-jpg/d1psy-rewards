const css = `
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 0,#321a46,#0e0a15 64%);color:#fbf5ff;font:16px system-ui,sans-serif}main{width:min(100% - 32px,940px);margin:auto;padding:28px 0 50px}a{color:#e3bafa}h1{font-size:clamp(36px,8vw,62px);margin:16px 0}p{color:#d6bfdc}.panel{border:1px solid #684586;border-radius:20px;background:#21132c;padding:22px}.stage{text-align:center;background:radial-gradient(ellipse at 50% 45%,#4e245f,#21132c 68%)}
#timer{font-size:30px;color:#ffdd9e;font-weight:800;font-variant-numeric:tabular-nums}.pig{position:relative;width:min(100%,330px);aspect-ratio:1.45;margin:12px auto 18px;isolation:isolate}.half{position:absolute;inset:0}.half.left{clip-path:polygon(0 0,52% 0,49% 29%,54% 45%,48% 64%,51% 82%,48% 100%,0 100%)}.half.right{clip-path:polygon(52% 0,100% 0,100% 100%,48% 100%,51% 82%,48% 64%,54% 45%,49% 29%)}
.body{position:absolute;inset:22% 19% 21% 12%;border-radius:54% 56% 42% 46%;background:radial-gradient(ellipse at 42% 22%,#ffc4e9,#de6eb1 45%,#8c386e);box-shadow:inset 0 -10px 17px #762d6a77,0 14px 32px #16051faa}.ear{position:absolute;top:15%;left:66%;width:15%;height:28%;border-radius:60% 42% 16% 23%;background:linear-gradient(#f49bcf,#bc5499);transform:rotate(18deg)}.ear::after{content:"";position:absolute;inset:19% 23% 24%;border-radius:50%;background:#a83f82}.leg{position:absolute;top:69%;left:24%;width:12%;height:17%;border-radius:15% 15% 32% 32%;background:linear-gradient(#bc5299,#954272);box-shadow:104px 0 #b15594}.tail{position:absolute;top:43%;left:4%;width:12%;aspect-ratio:1;border:5px solid #d879b3;border-right-color:transparent;border-radius:50%;transform:rotate(-24deg)}.slot{position:absolute;top:28%;left:39%;width:24%;height:5%;border-radius:50%;background:#49213f;box-shadow:0 2px #ffc2e1;transform:rotate(-4deg)}.eye{position:absolute;top:43%;left:73%;width:4%;aspect-ratio:1;background:#321329;border-radius:50%;box-shadow:inset 2px 2px #fff9}.snout{position:absolute;left:76%;top:49%;width:20%;height:23%;border-radius:42%;background:linear-gradient(#f3a1cf,#c665a2);box-shadow:inset 0 2px #ffdbed66}.snout::after{content:"";position:absolute;top:41%;left:24%;width:12%;height:27%;border-radius:50%;background:#833760;box-shadow:19px 0 #833760}.pig.burst .left{animation:break-left 1.3s ease-in both}.pig.burst .right{animation:break-right 1.3s ease-in both}.pig.burst::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse,#ffdb7ccc,transparent 66%);animation:flash 1.3s ease-out both}
@keyframes break-left{15%{transform:translateX(4px)}to{transform:translate(-28%,25%) rotate(-28deg);opacity:0}}@keyframes break-right{15%{transform:translateX(-4px)}to{transform:translate(28%,25%) rotate(28deg);opacity:0}}@keyframes flash{0%,15%,100%{opacity:0}35%{opacity:1}}
@media(prefers-reduced-motion:reduce){.pig.burst .half,.pig.burst::before{animation-duration:1ms}}
form{display:flex;justify-content:center;align-items:end;gap:8px;flex-wrap:wrap}label{display:grid;text-align:left;gap:5px}input,button,select{font:inherit;color:inherit;background:#190f24;border:1px solid #795399;border-radius:9px;padding:10px 13px}button{cursor:pointer;background:#793ac1;font-weight:750}button:disabled{opacity:.55;cursor:default}input{width:min(230px,100%)}#notice{min-height:1.4em}.results{margin-top:16px}.results ul{padding-left:20px}.results li{margin:8px 0}.metrics{display:flex;flex-wrap:wrap;gap:14px}.table{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:9px;border-bottom:1px solid #51385f}.pager{margin-top:10px;display:flex;gap:8px}[hidden]{display:none!important}
`;

const pig = '<span class="tail"></span><span class="leg"></span><span class="ear"></span><span class="body"></span><span class="slot"></span><span class="eye"></span><span class="snout"></span>';

export function piggyPage(admin: boolean) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Копилка · Dropso</title><style>${css}</style></head>
<body data-admin="${admin}"><main><a href="${admin ? '/admin' : '/account'}">← ${admin ? 'Админка' : 'На главную'}</a><h1>Копилка</h1>${admin ? `
<section class="panel"><label>День копилки <select id="day"></select></label><div id="metrics" class="metrics"></div>
<div class="table"><table><thead><tr><th>Игрок</th><th>Монеты</th><th>Приз</th><th>Цена приза</th></tr></thead><tbody id="entries"></tbody></table></div>
<div class="pager"><button id="back">Назад</button><button id="next">Далее</button></div><p id="notice" role="status"></p></section>` : `
<section class="panel stage"><p>Каждый день в 20:00 по Берлину копилка разбивается. От одного до трёх игроков получают скины. Чем больше монет ты внёс, тем выше шанс.</p>
<div id="timer" role="timer">—</div><div id="pig" class="pig" aria-hidden="true"><div class="half left">${pig}</div><div class="half right">${pig}</div></div>
<form id="add"><label>Монет в копилку<input id="amount" inputmode="numeric" pattern="[1-9][0-9]*" value="1" required></label>
<button id="submit" disabled>Положить монеты</button></form><p id="notice" role="status"></p></section>
<section id="results" class="panel results" hidden><h2 id="resultTitle">Последнее открытие</h2><ul id="winners"></ul></section>`}</main><script src="/piggy-bank.js" defer></script></body></html>`;
}

export const piggyScript = String.raw`
(() => {
  const el = id => document.getElementById(id);
  const messages = { invalid_request: 'Введи целое число монет от 1.', participation_restricted: 'Участие для этого аккаунта ограничено.',
    insufficient_coins: 'На балансе не хватает монет.', day_closed: 'Эта копилка уже закрылась. Проверь новый таймер.' };
  function say(message) { el('notice').textContent = message; }
  function errorText(error) { return messages[error.message] || 'Не удалось выполнить действие. Попробуй ещё раз.'; }
  async function request(path, payload) {
    const res = await fetch(path, payload ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)} : {cache:'no-store'});
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    return data;
  }
  if (document.body.dataset.admin === 'true') {
    let version = 0, current = '', offset = 0;
    async function load(day = current, index = offset) {
      const seq = ++version;
      try {
        const data = await request('/api/admin/piggy-bank?' + new URLSearchParams({...(day ? {day} : {}), offset:index}));
        if (seq !== version) return;
        current = data.day;
        offset = index;
        const days = [...new Set([data.activeDay,current,...data.previous])];
        el('day').replaceChildren(...days.map(d => new Option(d + (d === data.activeDay ? ' · текущая' : ''), d)));
        el('day').value = current;
        const metrics = ['Внесено: ' + data.total + ' мон.', 'Участников: ' + data.people, 'Взносов: ' + data.transactions];
        if (data.result) metrics.push('Бюджет призов: ' + data.result.budget + ' мон.', data.result.status === 'awarded' ? 'Призы выданы на ' + data.result.prizeValue + ' мон.' : 'Взносы возвращены');
        el('metrics').replaceChildren(...metrics.map(text => Object.assign(document.createElement('p'),{textContent:text})));
        el('entries').replaceChildren(...data.entries.map(e => {
          const row = document.createElement('tr');
          for (const value of [e.name,e.amount,e.skin ?? '—',e.value ?? '—']) row.insertCell().textContent = value;
          return row;
        }));
        el('back').disabled = index === 0;
        el('next').disabled = data.entries.length < 100;
        say('');
      } catch (error) { say(errorText(error)); }
    }
    el('day').onchange = () => load(el('day').value, 0);
    el('back').onclick = () => load(current, Math.max(0, offset - 100));
    el('next').onclick = () => load(current, offset + 100);
    load();
    setInterval(() => load(), 10000);
    return;
  }
  let state, offset = 0, loading = false, busy = false, revealing = false, waitFor = '', retry;
  function tick() {
    if (!state) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(state.endsAt) - Date.now() - offset) / 1000));
    el('timer').textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    el('submit').disabled = busy || revealing || !seconds;
  }
  function result(previous) {
    el('results').hidden = !previous;
    if (!previous) return;
    el('resultTitle').textContent = 'Открытие · ' + previous.day.split('-').reverse().join('.');
    const lines = previous.status === 'awarded' ? previous.winners.map(w => w.name + ' — ' + w.skin)
      : ['Подходящих призов не оказалось. Монеты возвращены.'];
    el('winners').replaceChildren(...lines.map(line => Object.assign(document.createElement('li'),{textContent:line})));
  }
  async function refresh() {
    if (loading || revealing) return;
    loading = true;
    try {
      const next = await request('/api/piggy-bank');
      if (state && state.day !== next.day) waitFor = state.day;
      state = next;
      offset = Date.parse(state.now) - Date.now();
      if (waitFor && state.previous?.day === waitFor) {
        waitFor = '';
        revealing = true;
        el('pig').classList.add('burst');
        tick();
        await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1300));
        el('pig').classList.remove('burst');
        revealing = false;
      }
      result(state.previous);
      tick();
    } catch (error) { say(errorText(error)); }
    finally { loading = false; }
  }
  el('add').onsubmit = async event => {
    event.preventDefault();
    if (!state || busy || revealing) return;
    const amount = el('amount').value.trim();
    if (!/^[1-9]\d*$/.test(amount)) { say(messages.invalid_request); return; }
    if (!window.confirm('Внести ' + amount + ' мон. в копилку?')) return;
    if (!retry || retry.day !== state.day || retry.amount !== amount) retry = {day:state.day,amount,requestId:crypto.randomUUID()};
    busy = true;
    tick();
    try { await request('/api/piggy-bank/add', retry); retry = null; say('Монеты в копилке.'); }
    catch (error) { say(errorText(error)); }
    finally { busy = false; tick(); }
  };
  refresh();
  setInterval(refresh, 3000);
  setInterval(tick, 250);
})();
`;
