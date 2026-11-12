const styles = `
*{box-sizing:border-box}body{margin:0;background:#0c0911;color:#faf5ff;font:16px system-ui,sans-serif}
main{max-width:1180px;margin:auto;padding:28px 18px}a{color:#dfb9ff}h1{font-size:clamp(32px,6vw,55px);margin-bottom:10px}
h2{font-size:18px;margin:0 0 16px}.grid{display:grid;grid-template-columns:minmax(155px,1fr) minmax(0,2fr) minmax(255px,1.4fr);gap:16px;align-items:start}
.panel{padding:20px;border:1px solid #503365;border-radius:16px;background:#181020;overflow-wrap:anywhere}.stage{text-align:center;background:radial-gradient(ellipse at 50% 45%,#402458,#17101e 72%)}
#price{font-size:24px;font-weight:800;color:#ffd98a}.auction-clock{display:flex;justify-content:center;align-items:flex-start;gap:7px;margin:14px 0 0;font-variant-numeric:tabular-nums}
.clock-unit{display:grid;gap:4px;text-align:center}.clock-unit b{min-width:48px;padding:7px 8px;border:1px solid #644183;border-radius:9px;background:linear-gradient(#2d1d40,#170f22);font-size:22px;line-height:1.15}
.clock-unit small{color:#c8afd9;font-size:11px}.clock-separator{padding-top:6px;color:#ab84cb;font-size:22px}.auction-clock[data-urgent="true"] .clock-unit b{color:#ffda94;border-color:#a87551}
#timerStatus{margin:12px 0 0;color:#e3c6f4}
.case{position:relative;width:min(100%,440px);aspect-ratio:3/2;margin:32px auto 10px;isolation:isolate;perspective:800px}
.case-body,.case-lid{position:absolute;inset:0;background:url('/black-box/case.jpg') center center/100% 100% no-repeat}
.case-body{clip-path:polygon(9.8% 39.3%,90.2% 39.3%,90.4% 42%,89.5% 43%,89.3% 49.8%,88.3% 51.4%,87.7% 75%,87.9% 79%,87.4% 84%,83.7% 88.8%,16.5% 88.8%,13% 85.5%,12.2% 83%,12.1% 75.5%,11.6% 53.3%,10.6% 50.2%,10.5% 43.5%,9.6% 42%)}
.case-lid{z-index:2;transform-origin:50% 40%;clip-path:polygon(9.5% 32%,11% 27.5%,13.4% 24.1%,13.5% 21.8%,16.2% 15.5%,17.6% 13.6%,20.8% 13.3%,21.9% 12.1%,24.3% 12.1%,25% 13.3%,31.6% 13.3%,32.3% 12.1%,37.5% 12.1%,38.2% 13.3%,61.2% 13.3%,62% 12.1%,67% 12.1%,68% 13.3%,74.6% 13.3%,75.4% 12.1%,78.3% 12.1%,79.4% 13.3%,82.2% 13.3%,84% 14.6%,86.3% 19.5%,86.5% 23.5%,88.4% 26.3%,90.5% 32.1%,90.5% 36.4%,89.8% 37.2%,90.2% 40.8%,9.8% 40.8%,10.2% 37.4%,9.5% 36.1%)}
.case-glow{position:absolute;z-index:1;top:32%;left:12%;width:76%;height:18%;border-radius:50%;opacity:0;background:radial-gradient(ellipse,#fff0fc,#ef83ff 25%,#9e32ff 55%,transparent 73%);filter:blur(6px);pointer-events:none}
.case.open .case-lid{animation:open-case 1.4s ease-out both}
.case.open .case-glow{animation:case-light 1.4s ease-out both}
@keyframes open-case{0%,16%{transform:none}to{transform:translateY(-18%) rotateX(-30deg)}}
@keyframes case-light{0%,16%{opacity:0;transform:scale(.75)}55%{opacity:1;transform:scale(1.15)}to{opacity:.8}}

form{display:grid;gap:12px}label{display:grid;gap:6px;text-align:left}button,input,select,textarea{font:inherit;border-radius:8px;padding:10px;border:1px solid #674683;background:#100c19;color:#fff;width:100%;min-width:0}
button{background:#7933c3;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:default}
li{padding:8px 0;border-bottom:1px solid #453251}ol{padding-left:23px;max-height:360px;overflow:auto;margin:0}
#notice{min-height:1.5em;color:#f3d2ff}#reveal{color:#ffdc96;font-weight:800}#previous img{max-width:100%;max-height:120px}
#participants{max-height:175px}.auction-side{display:grid;gap:16px;min-width:0}
.chat-panel{display:grid;gap:12px}.chat-panel h2,.chat-panel p{margin:0}
.chat-log{height:clamp(210px,32vh,340px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;background:#100c19;border:1px solid #422955;border-radius:9px;padding:10px 12px}
.chat-message{padding:7px 0;border-bottom:1px solid #342441;font-size:14px}.chat-message:last-child{border:0}
.chat-message header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px;color:#e9c4ff}
.chat-message time{font-size:11px;color:#c6afda;white-space:nowrap;font-variant-numeric:tabular-nums}.chat-message p{white-space:pre-wrap}
.chat-panel form{gap:6px}.chat-controls{display:flex;gap:8px}.chat-controls button{width:auto;flex:none;padding-inline:11px}
.chat-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#c6afda}.chat-meta output{white-space:nowrap;font-variant-numeric:tabular-nums}
#chatCounter[data-over="true"]{color:#ffadbd}.chat-log:focus-visible{outline:2px solid #c47fff;outline-offset:2px}
[hidden]{display:none!important}.admin{max-width:560px;margin:auto}
@media(min-width:761px){.grid>.stage,.grid>.auction-side{align-self:stretch}.auction-side{grid-template-rows:auto 1fr}.chat-panel{display:flex;flex-direction:column}.chat-log{flex-grow:1}}
@media(max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}.stage{order:-2}.auction-side{order:-1}}
@media(prefers-reduced-motion:reduce){.case.open .case-lid,.case.open .case-glow{animation-duration:1ms}}
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
  <section class="panel stage"><div id="price">Загрузка…</div><div id="timer" class="auction-clock" role="timer" aria-label="До окончания торгов" hidden>
    <span class="clock-unit"><b id="clockHours">00</b><small>часы</small></span><span class="clock-separator" aria-hidden="true">:</span>
    <span class="clock-unit"><b id="clockMinutes">00</b><small>минуты</small></span><span class="clock-separator" aria-hidden="true">:</span>
    <span class="clock-unit"><b id="clockSeconds">00</b><small>секунды</small></span>
  </div><p id="timerStatus" role="status" hidden>Подводим итоги…</p><p id="hint" hidden></p>
  <div class="case" id="case" aria-hidden="true"><div class="case-body"></div><div class="case-glow"></div><div class="case-lid"></div></div>
  <p id="reveal" role="status"></p><form id="bid" hidden><label>Твоя ставка в монетах<input id="amount" type="number" required></label>
  <button id="submit">Сделать ставку</button></form><p id="notice" role="status"></p></section>
  <div class="auction-side"><aside class="panel"><h2>Участники</h2><ol id="participants"></ol><p id="empty">Ставок пока нет</p></aside>
  <section class="panel chat-panel" aria-labelledby="chatHeading"><h2 id="chatHeading">Чат торгов</h2>
    <div class="chat-log" id="chatLog" role="log" aria-labelledby="chatHeading" tabindex="0">
      <p id="chatEmpty">Загружаем чат…</p><div id="chatMessages"></div>
    </div>
    <form id="chatForm" hidden><div class="chat-controls">
      <input id="chatInput" aria-label="Сообщение" placeholder="Сообщение" maxlength="280" autocomplete="off" required>
      <button id="chatSubmit" type="submit" disabled>Отправить</button>
    </div><div class="chat-meta"><span id="chatNotice" role="status"></span><output id="chatCounter" for="chatInput">0 / 140</output></div></form>
    <p class="chat-meta">Сообщения видны в течение часа</p>
  </section></div></div>`}
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
  async function request(path, body, signal) {
    const res = await fetch(path, body ? {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal
    } : { cache: 'no-store', signal });
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
        el('prize').replaceChildren(new Option('Выбери скин', ''), ...rows.map(row => {
          const price = row.sell_price_coins;
          return new Option(row.name + ' · ' + (price == null ? 'цена не задана' : price + ' мон.'), row.id);
        }));
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
  const chatLifetime = 60 * 60 * 1000;
  const chatTime = new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const chatLog = el('chatLog'), chatMessages = el('chatMessages'), chatInput = el('chatInput');
  const chatEntries = new Map();
  const chatErrors = {
    authentication_required: 'Войди через Twitch, чтобы писать в чат.',
    invalid_message: 'Введи сообщение от 1 до 140 символов.',
    chat_rate_limit: 'Подожди пару секунд перед следующим сообщением.'
  };
  let chatId = null, chatRequest = null, chatSending = false, chatLoaded = false, chatFailed = false;
  function chatEndpoint(id) { return '/api/black-box/chat/' + encodeURIComponent(id); }
  function updateChatForm() {
    const count = Array.from(chatInput.value.trim()).length;
    el('chatCounter').textContent = count + ' / 140';
    el('chatCounter').dataset.over = String(count > 140);
    const active = current?.id === chatId && Date.parse(current?.endsAt) > Date.now() + offset;
    el('chatForm').hidden = !active;
    el('chatSubmit').disabled = !active || chatSending || !count || count > 140;
  }
  function updateChatEmpty() {
    const empty = el('chatEmpty');
    empty.hidden = chatEntries.size > 0;
    empty.textContent = !chatId ? 'Чат откроется с началом торгов.' :
      chatFailed ? 'Не удалось обновить чат. Повторяем…' :
      chatLoaded ? 'Сообщений пока нет.' : 'Загружаем чат…';
  }
  function selectChat(id) {
    if (chatId !== id) {
      chatRequest?.abort();
      chatRequest = null;
      chatId = id;
      chatLoaded = chatFailed = false;
      chatEntries.clear();
      chatMessages.replaceChildren();
      chatInput.value = '';
      el('chatNotice').textContent = '';
      updateChatEmpty();
      if (id) loadChat();
    }
    updateChatForm();
  }
  function renderChat(rows) {
    const nearBottom = chatLog.scrollHeight - chatLog.clientHeight - chatLog.scrollTop < 32;
    const activeIds = rows ? new Set(rows.map(row => row.id)) : null;
    const cutoff = Date.now() + offset - chatLifetime;
    for (const [id, entry] of chatEntries) {
      if (entry.createdAt <= cutoff || activeIds && !activeIds.has(id)) {
        entry.node.remove();
        chatEntries.delete(id);
      }
    }
    for (const row of rows || []) {
      const createdAt = Date.parse(row.createdAt);
      if (chatEntries.has(row.id) || !Number.isFinite(createdAt) || createdAt <= cutoff) continue;
      const node = document.createElement('article');
      node.className = 'chat-message';
      const header = document.createElement('header');
      const author = document.createElement('strong');
      author.textContent = row.author;
      const time = document.createElement('time');
      time.dateTime = row.createdAt;
      time.textContent = chatTime.format(createdAt);
      const message = document.createElement('p');
      message.textContent = row.message;
      header.append(author, time);
      node.append(header, message);
      chatMessages.append(node);
      chatEntries.set(row.id, {node, createdAt});
    }
    updateChatEmpty();
    if (nearBottom) chatLog.scrollTop = chatLog.scrollHeight;
  }
  async function loadChat() {
    renderChat();
    if (!chatId || chatRequest || document.hidden) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 6000);
    chatRequest = controller;
    try {
      const data = await request(chatEndpoint(chatId), null, controller.signal);
      if (chatRequest !== controller) return;
      chatLoaded = true;
      chatFailed = false;
      renderChat(data.messages);
    } catch {
      if (chatRequest === controller) {
        chatFailed = true;
        updateChatEmpty();
      }
    } finally {
      clearTimeout(deadline);
      if (chatRequest === controller) chatRequest = null;
    }
  }
  chatInput.addEventListener('input', updateChatForm);
  el('chatForm').onsubmit = async event => {
    event.preventDefault();
    if (el('chatSubmit').disabled || el('chatForm').hidden) return;
    const id = chatId, value = chatInput.value;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 6000);
    chatSending = true;
    el('chatNotice').textContent = '';
    updateChatForm();
    try {
      await request(chatEndpoint(id), {message: value.trim()}, controller.signal);
      if (chatId === id && chatInput.value === value) chatInput.value = '';
      await loadChat();
    } catch (error) {
      if (chatId === id) el('chatNotice').textContent = chatErrors[error.message] || errorMessage(error);
    } finally {
      clearTimeout(deadline);
      chatSending = false;
      updateChatForm();
    }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadChat(); });
  setInterval(loadChat, 2000);

  function minimum(auction) { return auction.highBid == null ? auction.startPrice : auction.highBid + auction.step; }
  function timer() {
    if (!current) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(current.endsAt) - Date.now() - offset) / 1000));
    if (!seconds && !el('chatForm').hidden) updateChatForm();
    el('timer').hidden = seconds === 0;
    el('timer').dataset.urgent = String(seconds <= 600);
    el('timerStatus').hidden = seconds !== 0;
    const units = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
    ['clockHours', 'clockMinutes', 'clockSeconds'].forEach((id, index) => {
      const value = String(units[index]).padStart(2, '0');
      if (el(id).textContent !== value) el(id).textContent = value;
    });
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
      selectChat(current?.id || state.closed?.id || null);
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
        el('timer').hidden = true;
        el('timerStatus').hidden = true;
      }
      if (old && old.id !== current?.id && old.id === state.closed?.id) {
        revealing = true;
        el('bid').hidden = true;
        el('case').classList.add('open');
        setTimeout(() => {
          el('reveal').textContent = state.closed.winner
            ? state.closed.winner + ' получает ' + state.closed.prize
            : 'В ящике было: ' + state.closed.prize + '. Ставок не было.';
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
