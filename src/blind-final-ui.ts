const css = `
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 0,#2d1644,transparent 55%),#0c0911;color:#faf5ff;font:16px system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:28px 18px}a{color:#dbb6ff}h1{font-size:clamp(32px,6vw,54px);margin:15px 0 20px}h2{font-size:18px;margin:0 0 12px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2.2fr) minmax(0,.8fr);gap:14px;align-items:start}.panel{border:1px solid #573876;background:#181021;padding:20px;border-radius:17px;overflow-wrap:anywhere}.stage{text-align:center;background:radial-gradient(ellipse at 50% 24%,#41275c,#1b1129 62%)}.count{font-size:40px;color:#e5b8ff;line-height:1.1}small,p{color:#ceb9dc}#timer{font-variant-numeric:tabular-nums;font-weight:800}
.display{position:relative;display:grid;place-items:center;isolation:isolate;width:min(100%,340px);height:206px;margin:6px auto}.pedestal{position:absolute;bottom:19px;width:72%;height:42px;border-radius:50%;background:radial-gradient(ellipse,#9e62d7 0,#563581 37%,#261a3d 73%);border:2px solid #b36cff;box-shadow:0 8px 0 #281541,0 13px 0 #382252,0 15px 28px #a949ff88,inset 0 0 14px #d9a8ff66}.display img{position:relative;width:90%;height:135px;object-fit:contain;transform:translateY(-10px);filter:drop-shadow(0 15px 10px #090412aa);animation:float-skin 3.4s ease-in-out infinite alternate}
@keyframes float-skin{to{transform:translateY(-21px)}}@media(prefers-reduced-motion:reduce){.display img{animation:none}}
.controls,form{display:grid;gap:11px}label{display:grid;gap:5px}button,input,select{font:inherit;color:inherit;border-radius:9px;padding:10px;border:1px solid #67478a;background:#151021;min-width:0}button{cursor:pointer;background:#7736be;font-weight:750}button:disabled{opacity:.55;cursor:default}
.numbers{display:grid;grid-template-columns:repeat(auto-fit,minmax(42px,1fr));gap:6px;max-height:280px;overflow:auto;padding:3px}.numbers span{padding:7px;border-radius:7px;background:#27183a}.numbers .win{background:#714319;color:#ffe5a0;outline:1px solid #ffc873}.numbers .empty{opacity:.45}
table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}td,th{padding:8px 5px;border-bottom:1px solid #4a365b;vertical-align:top}.admin{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:8px}.round{display:flex;flex-wrap:wrap;align-items:center;gap:8px;border-bottom:1px solid #503461;padding:9px 0}.round span{flex:1 1 140px}.round button{font-size:13px}.pager{display:flex;gap:7px;margin:8px 0}
[hidden]{display:none!important}@media(max-width:760px){.layout,.admin{grid-template-columns:1fr}.stage{order:-2}.participant-panel{order:-1}}
`;

export function blindPage(admin: boolean) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Слепой финал · Dropso</title><style>${css}</style></head>
<body data-admin="${admin}"><main><a href="${admin ? '/admin' : '/games'}">← ${admin ? 'Админка' : 'Игры'}</a><h1>Слепой финал</h1>${admin ? `
<div class="admin"><section class="panel"><h2>Новый раунд</h2><form id="start">
<label>Длительность в минутах<input id="minutes" type="number" min="1" max="10080" value="360" required></label>
<div class="twocol"><label>Первое число<input id="low" type="number" min="0" max="9998" value="1" required></label>
<label>Последнее число<input id="high" type="number" min="1" max="9999" value="50" required></label></div>
<label>Цена участия в монетах<input id="fee" type="number" min="0" max="1000000" value="0" required></label>
<label>Поиск скина<input id="search" type="search"></label><label>Приз<select id="prize" required></select></label>
<button>Запустить раунд</button></form><p id="notice" role="status"></p></section>
<section class="panel"><h2>История игр</h2><div id="rounds"></div><div class="pager"><button id="older">Раньше</button><button id="newer">Новее</button></div>
<div id="detail" hidden><h2>Выбор участников</h2><table><thead><tr><th>Имя</th><th>Взнос</th><th>Число</th></tr></thead><tbody id="entries"></tbody></table>
<div class="pager"><button id="prevEntries">Назад</button><button id="nextEntries">Далее</button></div></div></section></div>` : `
<div class="layout"><aside class="panel"><h2>Предыдущие игры</h2><table><thead><tr><th>Имя</th><th>Скин</th></tr></thead><tbody id="history"></tbody></table><p id="emptyHistory">Пока нет победителей</p></aside>
<section class="panel stage"><p>Побеждает самое маленькое число, которое выбрал ровно один игрок. Для финала нужны хотя бы три подтверждённых числа.</p>
<div id="prizePanel" hidden><div class="display"><div class="pedestal" aria-hidden="true"></div><img id="skinImage" alt="" hidden></div><h2 id="skinName"></h2>
<p id="range"></p><p id="timer"></p>
<div class="controls"><button id="enter" hidden>Принять участие</button>
<form id="pick" hidden><label>Твоё число<input id="number" type="number" required></label><button id="confirm">Подтвердить число</button></form><p id="choice" hidden></p></div></div>
<p id="notice" role="status">Загружаем раунд…</p><div id="reveal" class="numbers" hidden></div><button id="replay" hidden>Посмотреть финал</button></section>
<aside class="panel participant-panel"><h2>Участники</h2><strong id="count" class="count">—</strong></aside></div>`}
</main><script src="/games/blind-final.js" defer></script></body></html>`;
}

export const blindScript = String.raw`
(() => {
  const el = id => document.getElementById(id);
  const messages = {
    invalid_request: 'Проверь введённые значения.', round_active: 'Сначала заверши текущий раунд.',
    unknown_prize: 'Скин недоступен.', round_not_found: 'Раунд не найден.', round_closed: 'Раунд уже закрыт.',
    participation_restricted: 'Участие для этого аккаунта ограничено.',
    insufficient_coins: 'Не хватает монет.', entry_required: 'Сначала прими участие.',
    number_locked: 'Ты уже подтвердил число.', authentication_required: 'Войди через Twitch.'
  };
  function say(message) { el('notice').textContent = message; }
  function errorText(error) { return messages[error.message] || 'Не удалось выполнить действие. Попробуй ещё раз.'; }
  async function request(path, payload) {
    const response = await fetch(path, payload ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    } : { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    return data;
  }
  function row(values) {
    const tr = document.createElement('tr');
    for (const value of values) tr.insertCell().textContent = value;
    return tr;
  }
  function action(text, handler) {
    const button = document.createElement('button');
    button.textContent = text;
    button.onclick = handler;
    return button;
  }

  if (document.body.dataset.admin === 'true') {
    const api = '/api/admin/blind-final';
    const labels = { open:'Идёт', won:'Завершён', cancelled:'Отменён', no_winner:'Без победителя' };
    let page = 0, entryPage = 0, selected, watching = false, searchTimer, prizeRequest = 0, listRequest = 0, detailRequest = 0;
    async function prizes() {
      const key = ++prizeRequest;
      try {
        const rows = await request(api + '/prizes?q=' + encodeURIComponent(el('search').value));
        if (key !== prizeRequest) return;
        el('prize').replaceChildren(new Option('Выбери скин', ''), ...rows.map(p =>
          new Option(p.name + ' · ' + (p.sell_price_coins == null ? 'цена не задана' : p.sell_price_coins + ' мон.'), p.id)));
      } catch (error) { say(errorText(error)); }
    }
    async function detail(id, index) {
      selected = id;
      entryPage = index;
      const key = ++detailRequest;
      try {
        const rows = await request(api + '/rounds/' + id + '?page=' + index);
        if (key !== detailRequest) return;
        el('entries').replaceChildren(...rows.map(entry => {
          const user = entry.rewards_users;
          return row([(user?.twitch_display_name || user?.twitch_login || 'Игрок') + (entry.won ? ' ★' : ''), entry.entry_fee ? entry.entry_fee + ' мон.' : 'Бесплатно', entry.number ?? 'Не выбрано']);
        }));
        el('prevEntries').disabled = index === 0;
        el('nextEntries').disabled = rows.length < 100;
        el('detail').hidden = false;
      } catch (error) { say(errorText(error)); }
    }
    async function rounds(index = page) {
      const key = ++listRequest;
      try {
        const rows = await request(api + '/rounds?page=' + index);
        if (key !== listRequest) return;
        page = index;
        el('rounds').replaceChildren(...rows.map(game => {
          const item = document.createElement('div');
          item.className = 'round';
          const title = document.createElement('span');
          title.textContent = new Date(game.starts_at).toLocaleString('ru-RU') + ' · ' + game.rewards_prizes?.name + ' · ' + labels[game.status];
          const settings = document.createElement('small');
          settings.textContent = game.low_number + '–' + game.high_number + ' · вход ' + game.entry_fee + ' мон. · до ' + new Date(game.ends_at).toLocaleString('ru-RU');
          title.append(document.createElement('br'), settings);
          item.append(title);
          if (game.status === 'open') item.append(action('Отменить', async () => {
            if (!window.confirm('Отменить раунд и вернуть взносы?')) return;
            try { await request(api + '/cancel', {id: game.id}); await rounds(); }
            catch (error) { say(errorText(error)); }
          }));
          item.append(action(game.status === 'open' ? 'Участники и числа' : 'Числа', () => {
            watching = game.status === 'open';
            return detail(game.id, 0);
          }));
          return item;
        }));
        el('older').disabled = rows.length < 20;
        el('newer').disabled = index === 0;
        if (watching && selected) {
          const game = rows.find(row => row.id === selected);
          if (game && game.status !== 'open') watching = false;
          await detail(selected, entryPage);
        }
      } catch (error) { say(errorText(error)); }
    }
    el('start').onsubmit = async event => {
      event.preventDefault();
      event.submitter.disabled = true;
      try {
        const config = Object.fromEntries(['minutes', 'low', 'high', 'fee'].map(id => [id, Number(el(id).value)]));
        await request(api + '/start', { ...config, prize: el('prize').value });
        say('Раунд запущен.');
        await rounds(0);
      } catch (error) { say(errorText(error)); }
      finally { event.submitter.disabled = false; }
    };
    el('search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(prizes, 250); };
    el('older').onclick = () => rounds(page + 1);
    el('newer').onclick = () => rounds(Math.max(0, page - 1));
    el('prevEntries').onclick = () => detail(selected, Math.max(0, entryPage - 1));
    el('nextEntries').onclick = () => detail(selected, entryPage + 1);
    prizes();
    rounds();
    setInterval(() => rounds(), 10000);
    return;
  }

  const api = '/api/blind-final';
  let state, pending = false, refreshing = false, revealing = false, offset = 0, message = '';
  function history(rows) {
    el('history').replaceChildren(...rows.map(item => row([item.name, item.skin])));
    el('emptyHistory').hidden = rows.length > 0;
  }
  function timer() {
    const game = state?.current;
    if (!game) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(game.endsAt) - Date.now() - offset) / 1000));
    el('timer').textContent = seconds ? [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(n => String(n).padStart(2, '0')).join(':') : 'Подводим итоги…';
    el('enter').disabled = pending || !seconds;
    el('confirm').disabled = pending || !seconds;
  }
  function resultText(result) {
    if (result.status === 'won') return result.name + ' получает ' + result.skin + '.';
    return result.status === 'cancelled' ? 'Раунд отменён. Взносы возвращены.' : 'Победителя нет. Взносы возвращены.';
  }
  function render(previousId) {
    const game = state.current;
    el('prizePanel').hidden = !game;
    el('count').textContent = game?.participants ?? '—';
    el('replay').hidden = !state.latest || state.latest.status === 'cancelled';
    if (!game) { say(message || (state.latest ? resultText(state.latest) : 'Новый раунд пока не запущен.')); return; }
    if (previousId !== game.id) {
      el('number').value = '';
      el('reveal').hidden = true;
    }
    const img = el('skinImage');
    const src = typeof game.image === 'string' && /^https:\/\//i.test(game.image) ? game.image : '';
    img.hidden = !src;
    if (src && img.getAttribute('src') !== src) img.src = src;
    el('skinName').textContent = game.skin;
    el('range').textContent = (game.high - game.low + 1) + ' чисел · от ' + game.low + ' до ' + game.high;
    el('number').min = game.low;
    el('number').max = game.high;
    el('enter').hidden = game.joined;
    el('enter').textContent = 'Принять участие · ' + (game.fee ? game.fee + ' мон.' : 'бесплатно');
    el('pick').hidden = !game.joined || game.number != null;
    el('choice').hidden = game.number == null;
    el('choice').textContent = 'Твой выбор — ' + game.number;
    say(message || (game.joined && game.number == null ? 'Подтверди одно число до конца раунда.' : ''));
    timer();
  }
  async function reveal(result) {
    if (revealing) return;
    revealing = true;
    el('prizePanel').hidden = true;
    el('replay').hidden = true;
    const grid = el('reveal');
    grid.hidden = false;
    grid.replaceChildren();
    say('Раскрываем числа…');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const last = result.winning ?? result.high;
    const delay = reduced ? 0 : Math.min(180, Math.max(12, 4500 / (last - result.low + 1)));
    for (let n = result.low; n <= last; n++) {
      const count = result.counts[n] || 0;
      const cell = document.createElement('span');
      cell.textContent = n + ' · ' + count;
      cell.className = n === result.winning ? 'win' : count ? '' : 'empty';
      grid.append(cell);
      if (delay) {
        grid.scrollTop = grid.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    revealing = false;
    history(state.previous);
    say(resultText(result));
    el('replay').hidden = false;
  }
  async function refresh() {
    if (refreshing || revealing || pending) return;
    refreshing = true;
    try {
      const previousId = state?.current?.id;
      state = await request(api);
      offset = Date.parse(state.now) - Date.now();
      if (previousId && previousId !== state.current?.id && previousId === state.latest?.id && state.latest.status !== 'cancelled') {
        await reveal(state.latest);
      } else {
        history(state.previous);
        render(previousId);
      }
    } catch (error) { say(errorText(error)); }
    finally { refreshing = false; }
  }
  async function play(path, number) {
    if (!state?.current || pending || revealing) return;
    pending = true;
    timer();
    const payload = {id: state.current.id};
    if (number !== undefined) payload.number = number;
    try { await request(api + '/' + path, payload); message = ''; }
    catch (error) { message = errorText(error); say(message); }
    finally { pending = false; await refresh(); timer(); }
  }
  el('enter').onclick = () => {
    const fee = state?.current?.fee;
    if (!fee || window.confirm('Зарезервировать ' + fee + ' мон. за участие?')) play('enter');
  };
  el('pick').onsubmit = event => {
    event.preventDefault();
    const number = Number(el('number').value);
    if (window.confirm('Подтвердить число ' + number + '?')) play('pick', number);
  };
  el('replay').onclick = () => { if (state?.latest) reveal(state.latest); };
  refresh();
  setInterval(refresh, 2500);
  setInterval(timer, 250);
})();
`;
