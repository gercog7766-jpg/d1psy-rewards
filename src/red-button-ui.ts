export const redButtonPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Красная кнопка · Dropso</title>
<link rel="stylesheet" href="/live-chat.css"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;color:#f9edf3;background:radial-gradient(ellipse at 50% 15%,#43192d,#140d20 55%,#0c0913);font:16px/1.55 system-ui}
main{max-width:1020px;margin:auto;padding:22px 14px 52px}a{color:#e9c6ff}h1{font-size:clamp(32px,6vw,61px);margin:5px 0 14px;line-height:1.1}h2{font-size:19px;margin:0 0 8px}
.layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px;align-items:start}
.panel{background:#211429;border:1px solid #644578;border-radius:18px;padding:15px;margin:0 0 14px}.stage{text-align:center;display:grid;justify-items:center;gap:5px}
.stage img{max-width:100%;width:320px;height:110px;object-fit:contain}.stage p{margin:3px 0}.clock{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffe4a5}
.press{width:min(85%,245px);min-height:92px;margin:15px 0;border:2px solid #ff7496;border-radius:50%;color:#fff;background:radial-gradient(ellipse at 48% 28%,#fa5475,#b82446 57%,#7f0a2a);box-shadow:0 7px 0 #570c26,0 14px 38px #ee345d5f;font:800 18px/1.2 system-ui;cursor:pointer;padding:10px}
.press:enabled:active{transform:translateY(3px);box-shadow:0 4px 0 #570c26}.press:disabled{opacity:.66;cursor:default}.press:focus-visible{outline:3px solid white;outline-offset:5px}
#notice{color:#ffadc4}.muted{color:#d5bad7}table{border-collapse:collapse;width:100%;font-size:14px;text-align:left}td,th{border-bottom:1px solid #604263;padding:7px 4px;overflow-wrap:anywhere}th:last-child,td:last-child{text-align:right}
.dropso-live-chat{margin:0 0 14px}@media(max-width:700px){.layout{grid-template-columns:1fr}}
</style></head><body><main>
<a href="/games">← Игры</a><h1>Красная кнопка</h1>
<div class="layout"><div>
<section class="panel stage" aria-label="Текущий раунд">
  <p class="muted">Сегодняшний приз</p><img id="image" hidden alt=""><strong id="prize">Загрузка…</strong>
  <p id="countdown" class="clock"></p><p id="holder" class="muted"></p><p id="playerCount" class="muted"></p>
  <button type="button" id="press" class="press" disabled>Войти за 10 монет</button>
  <p id="notice" role="status"></p>
</section>
<section class="panel"><h2>Как играть</h2><p>Вход в раунд стоит 10 монет. Первое нажатие оплачивает вход и передаёт кнопку тебе. После каждого успешного нажатия нужно подождать 20 минут. Если кнопку ещё никто не перехватил, ты продолжаешь держать её.</p><p>Побеждает тот, кто дольше всех держал кнопку без перерыва. При равенстве побеждает тот, кто раньше начал это удержание. Время победителя появится в истории после раунда. Раунды заканчиваются в полночь по Москве.</p></section>
</div><div>
<section class="dropso-live-chat" data-chat-panel="room" data-chat-participant="false" data-room="" hidden>
  <h2>Чат раунда</h2><ol aria-label="Сообщения"></ol><form><input name="message" maxlength="140" aria-label="Сообщение" required><button type="submit">Отправить</button></form><p role="status"></p>
</section>
<section class="panel"><h2>Прошлые игры</h2><table><thead><tr><th>Ник</th><th>Скин</th><th>Время удержания кнопки</th></tr></thead><tbody id="history"></tbody></table><p id="noHistory" class="muted">Пока нет завершённых раундов с победителем.</p></section>
</div></div>
</main><script src="/games/red-button.js" defer></script><script src="/live-chat.js" defer></script></body></html>`;

export const redButtonScript = String.raw`(() => {
  const el = id => document.getElementById(id);
  const button = el('press');
  const chat = document.querySelector('[data-chat-panel]');
  const failures = {
    user_unavailable:'Для твоего аккаунта участие недоступно.',
    insufficient_coins:'Для входа нужно 10 монет.',
    cooldown:'До следующего нажатия ещё нужно подождать.',
    already_holding:'Кнопка уже у тебя.',
    round_closed:'Раунд завершился. Обновляем приз.'
  };
  let state, offset = 0, pending, busy = false, loading = false;
  const secondsUntil = stamp => Math.max(0, Math.ceil((Date.parse(stamp)-Date.now()-offset)/1000)) || 0;
  function duration(seconds) {
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
      .map(n => String(n).padStart(2,'0')).join(':');
  }
  function clock() {
    const round = state?.round;
    const left = secondsUntil(round?.endsAt);
    const wait = secondsUntil(round?.readyAt);
    el('countdown').textContent = round ? 'До конца раунда: ' + duration(left) : '';
    button.disabled = !state?.canPlay || !round || !left || busy || round.holding || wait > 0;
    button.textContent = !round?.joined ? 'Войти за 10 монет и нажать' : round.holding
      ? 'Кнопка у тебя' : wait ? 'Нажатие через ' + duration(wait) : 'Перехватить кнопку';
  }
  function render() {
    const round = state.round;
    el('prize').textContent = round ? [round.prize,round.wear,round.price+' мон.'].filter(Boolean).join(' · ') : 'Раунд пока недоступен';
    const image = el('image');
    image.hidden = !round?.image;
    if (round?.image && image.getAttribute('src') !== round.image) image.src = round.image;
    if (!round?.image) image.removeAttribute('src');
    el('holder').textContent = round?.holder ? 'Кнопку держит ' + round.holder : 'Кнопку пока никто не держит';
    el('playerCount').textContent = Number.isInteger(round?.playerCount) ? 'Игроков в раунде: ' + round.playerCount : '';
    chat.dataset.room = round?.id || '';
    chat.dataset.chatParticipant = String(Boolean(round?.joined));
    if (pending?.roundId !== round?.id) pending = undefined;
    const list = el('history');
    const key = JSON.stringify(state.history);
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.replaceChildren(...state.history.map(row => {
        const tr = document.createElement('tr');
        tr.title = row.day;
        for (const text of [row.nick,row.skin,duration(Math.floor(row.duration/1000))]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }));
      el('noHistory').hidden = Boolean(state.history.length);
    }
    clock();
  }
  async function refresh(press = false) {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch('/api/me/red-button', press ? {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)
      } : {cache:'no-store'});
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(data.error);
      state = data; offset = Date.parse(data.now)-Date.now();
      if (press) pending = undefined;
      el('notice').textContent = '';
      render();
    } catch (error) {
      if (failures[error.message]) pending = undefined;
      el('notice').textContent = failures[error.message] || 'Не удалось обновить раунд. Попробуй ещё раз.';
    } finally { loading = false; }
  }
  button.addEventListener('click', async () => {
    if (busy || loading || !state?.round) return;
    busy = true;
    clock();
    try {
      if (!state.round.joined && !await window.dropsoConfirm('Войти за 10 монет и сразу нажать кнопку?')) return;
      pending ||= {roundId:state.round.id,requestId:crypto.randomUUID()};
      await refresh(true);
    } finally { busy = false; clock(); }
  });
  void refresh();
  setInterval(clock,1000);
  setInterval(() => { if (!document.hidden && !busy) void refresh(); },5000);
})();`;
