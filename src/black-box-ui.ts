const styles = `
*{box-sizing:border-box}body{margin:0;background:#0c0911;color:#faf5ff;font:16px system-ui,sans-serif}
main{max-width:1180px;margin:auto;padding:28px 18px}a{color:#dfb9ff}h1{font-size:clamp(32px,6vw,55px);margin-bottom:10px}
h2{font-size:18px;margin:0 0 16px}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
.panel{padding:20px;border:1px solid #503365;border-radius:16px;background:#181020;overflow-wrap:anywhere}.stage{text-align:center;background:radial-gradient(ellipse at 50% 45%,#402458,#17101e 72%)}
#price{font-size:24px;font-weight:800;color:#ffd98a}#timer{font-variant-numeric:tabular-nums;font-size:22px}
.case{position:relative;width:min(100%,290px);height:142px;margin:64px auto 24px;perspective:600px;isolation:isolate}
.case-body,.case-lid{position:absolute;left:0;width:100%;border:2px solid #766786;background:repeating-linear-gradient(90deg,#23202b 0 10px,#34303e 11px 14px,#23202b 15px 32px);box-shadow:inset 0 5px 12px #ffffff15,0 16px 30px #0008}
.case-body{height:100px;bottom:0;border-radius:8px 8px 16px 16px}.case-lid{top:20px;height:38px;border-radius:12px 12px 4px 4px;z-index:2;transform-origin:50% 100%}
.case-lid::before{content:"";position:absolute;left:35%;width:30%;height:22px;top:-21px;border:6px solid #605769;border-bottom:0;border-radius:10px 10px 0 0}
.case-body::after{content:"";position:absolute;top:8px;left:calc(50% - 20px);width:40px;height:38px;border-radius:7px;background:linear-gradient(140deg,#bb9c72,#52403d);border:1px solid #f9dba7}
.case.open .case-lid{animation:open-case 1.4s ease-out both}.case.open::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse,#ffc97599,transparent 65%);animation:case-light 1.4s ease-out both}
@keyframes open-case{to{transform:rotateX(72deg) translateY(-52px)}}@keyframes case-light{from{opacity:0}to{opacity:1}}
form{display:grid;gap:12px}label{display:grid;gap:6px;text-align:left}button,input,select,textarea{font:inherit;border-radius:8px;padding:10px;border:1px solid #674683;background:#100c19;color:#fff;width:100%;min-width:0}
button{background:#7933c3;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:default}
li{padding:8px 0;border-bottom:1px solid #453251}ol{padding-left:23px;max-height:360px;overflow:auto;margin:0}
#notice{min-height:1.5em;color:#f3d2ff}#reveal{color:#ffdc96;font-weight:800}#previous img{max-width:100%;max-height:120px}
[hidden]{display:none!important}.admin{max-width:560px;margin:auto}
@media(max-width:760px){.grid{grid-template-columns:1fr}.stage{order:-1}}
@media(prefers-reduced-motion:reduce){.case.open .case-lid,.case.open::before{animation-duration:1ms}}
`;

export function blackBoxPage(admin: boolean) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Чёрный ящик · Dropso</title><style>${styles}</style></head>
  <body data-admin="${admin}"><main><a href="${admin ? '/admin' : '/account'}">← ${admin ? 'Админка' : 'На главную'}</a>
  <h1>Чёрный ящик</h1>${admin ? `
  <section class="panel admin"><h2>Запустить торги на 6 часов</h2>
  <form id="create"><label>Стартовая цена<input id="start" type="number" min="1" required></label>
  <label>Минимальный шаг<input id="step" type="number" min="1" required></label>
  <label>Тип приза<select id="kind"><option value="skin">Скин из каталога призов</option><option value="coins">Монеты</option></select></label>
  <label id="skinField">Скин<input id="prizeSearch" type="search" placeholder="Поиск по названию"><select id="prize"></select></label>
  <label id="coinsField" hidden>Монет в ящике<input id="coins" type="number" min="1"></label>
  <label>Подсказка (необязательно)<textarea id="hint" maxlength="400"></textarea></label>
  <button>Запустить торги</button></form><p id="notice" role="status"></p></section>` : `
  <div class="grid"><aside class="panel"><h2>Предыдущий победитель</h2><div id="previous"></div></aside>
  <section class="panel stage"><div id="price">Загрузка…</div><p id="timer"></p><p id="hint" hidden></p>
  <div class="case" id="case" aria-hidden="true"><div class="case-body"></div><div class="case-lid"></div></div>
  <p id="reveal" role="status"></p><form id="bid" hidden><label>Твоя ставка в монетах<input id="amount" type="number" required></label>
  <button id="submit">Сделать ставку</button></form><p id="notice" role="status"></p></section>
  <aside class="panel"><h2>Участники</h2><ol id="participants"></ol><p id="empty">Ставок пока нет</p></aside></div>`}
  </main><script src="/black-box.js" defer></script></body></html>`;
}

export const blackBoxScript = String.raw`
(() => {
  const el = id => document.getElementById(id);
  const messages = {
    authentication_required: 'Войди через Twitch, чтобы сделать ставку.',
    participation_restricted: 'Участие для этого аккаунта ограничено.',
    insufficient_coins: 'На балансе не хватает монет.',
    auction_open: 'Предыдущие торги ещё идут.',
    auction_closed: 'Торги уже закончились.',
    bid_too_low: 'Ставку перебили. Проверь новый минимум.',
    unknown_prize: 'Выбранный приз недоступен.',
    invalid_request: 'Проверь заполненные поля.'
  };
  async function request(path, body) {
    const res = await fetch(path, body ? {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
    } : { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    return data;
  }
  function errorMessage(error) {
    return messages[error.message] || 'Не удалось выполнить действие. Попробуй ещё раз.';
  }
  if (document.body.dataset.admin === 'true') {
    const kind = el('kind');
    let searchTimer, searchVersion = 0;
    async function loadPrizes() {
      const version = ++searchVersion;
      try {
        const rows = await request('/api/admin/black-box/prizes?q=' + encodeURIComponent(el('prizeSearch').value));
        if (version !== searchVersion) return;
        el('prize').replaceChildren(new Option('Выбери скин', ''), ...rows.map(row => new Option(row.name, row.id)));
      } catch (error) { el('notice').textContent = errorMessage(error); }
    }
    el('prizeSearch').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadPrizes, 250);
    };
    kind.onchange = () => {
      el('skinField').hidden = kind.value !== 'skin';
      el('coinsField').hidden = kind.value !== 'coins';
    };
    el('create').onsubmit = async event => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      try {
        await request('/api/admin/black-box', {
          start: Number(el('start').value), step: Number(el('step').value), hint: el('hint').value,
          prizeId: kind.value === 'skin' ? el('prize').value : null,
          prizeCoins: kind.value === 'coins' ? Number(el('coins').value) : null
        });
        el('notice').textContent = 'Торги запущены.';
      } catch (error) { el('notice').textContent = errorMessage(error); }
      finally { button.disabled = false; }
    };
    loadPrizes();
    return;
  }

  let current, offset = 0, loading = false, submitting = false, revealing = false;
  function minimum(auction) { return auction.highBid == null ? auction.startPrice : auction.highBid + auction.step; }
  function timer() {
    if (!current) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(current.endsAt) - Date.now() - offset) / 1000));
    el('timer').textContent = seconds ? [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':') : 'Подводим итоги…';
    el('submit').disabled = submitting || !seconds || minimum(current) > 1000000000;
  }
  function previous(result) {
    const panel = el('previous');
    panel.textContent = result ? result.winner + ' · ' + result.amount + ' мон. · ' + result.prize : 'Пока нет победителей';
    if (result && typeof result.image === 'string' && /^https:\/\//i.test(result.image)) {
      const img = document.createElement('img');
      img.src = result.image;
      img.alt = '';
      panel.append(document.createElement('br'), img);
    }
  }
  async function refresh() {
    if (loading || revealing) return;
    loading = true;
    try {
      const state = await request('/api/black-box');
      const old = current;
      current = state.current;
      offset = Date.parse(state.serverNow) - Date.now();
      el('hint').hidden = !current?.hint;
      el('hint').textContent = current?.hint || '';
      el('bid').hidden = !current;
      const list = document.createDocumentFragment();
      for (const entry of state.participants) {
        const item = document.createElement('li');
        item.textContent = entry.name + ' · ' + entry.amount + ' мон.';
        list.append(item);
      }
      el('participants').replaceChildren(list);
      el('empty').hidden = state.participants.length > 0;
      if (current) {
        const amount = el('amount');
        const next = minimum(current);
        if (old?.id !== current.id || !amount.value || Number(amount.value) === Number(amount.min)) amount.value = next;
        amount.min = next;
        el('case').classList.remove('open');
        el('reveal').textContent = '';
        el('price').textContent = (current.highBid == null ? 'Стартовая цена ' : 'Текущая ставка ') + (current.highBid ?? current.startPrice) + ' мон.';
        timer();
      } else {
        el('price').textContent = 'Сейчас нет открытых торгов';
        el('timer').textContent = '';
      }
      if (old && old.id !== current?.id && old.id === state.previous?.id) {
        revealing = true;
        el('bid').hidden = true;
        el('case').classList.add('open');
        setTimeout(() => {
          el('reveal').textContent = state.previous.winner + ' получает ' + state.previous.prize;
          previous(state.previous);
          el('bid').hidden = !current;
          revealing = false;
        }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400);
      } else {
        previous(state.previous);
      }
    } catch (error) {
      el('notice').textContent = errorMessage(error);
    } finally {
      loading = false;
    }
  }
  el('bid').onsubmit = async event => {
    event.preventDefault();
    if (!current || submitting) return;
    submitting = true;
    timer();
    try {
      await request('/api/black-box/bid', {id: current.id, amount: Number(el('amount').value)});
      el('notice').textContent = 'Ставка принята.';
    } catch (error) {
      el('notice').textContent = errorMessage(error);
    } finally {
      submitting = false;
      await refresh();
      timer();
    }
  };
  refresh();
  setInterval(refresh, 2000);
  setInterval(timer, 250);
})();
`;
