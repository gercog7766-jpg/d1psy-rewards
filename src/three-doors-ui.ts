export function threeDoorsPage(stakes: number[]) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Три двери · Dropso</title><style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:#f8efff;background:radial-gradient(ellipse at top,#35204e,#130d22 48%,#0b0812);font:16px/1.5 system-ui}
main{width:min(940px,100%);margin:auto;padding:24px clamp(12px,4vw,32px) 48px}
nav{display:flex;justify-content:space-between;gap:12px;align-items:center}a{color:#e3bdff}
header{text-align:center;margin:27px 0 20px}h1{margin:0;font-size:clamp(36px,8vw,64px);line-height:1.12;letter-spacing:-.045em}
header p{color:#d3c1e4;margin:14px auto 0;max-width:52ch}
.stage,.controls{border:1px solid #6c4b91;border-radius:20px;background:#1b112ae0}
.stage{padding:clamp(8px,3vw,24px);overflow:hidden}
.doors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(5px,3vw,23px)}
.slot{position:relative;min-width:0;aspect-ratio:3/4;max-height:330px;perspective:850px;border:1px solid var(--tone);border-radius:12px;background:radial-gradient(ellipse,#48365c,#100a19 75%);box-shadow:inset 0 0 18px #000a}
.slot:nth-child(1){--tone:#ba77ff;--dark:#3a165b}
.slot:nth-child(2){--tone:#69d6ff;--dark:#10425b}
.slot:nth-child(3){--tone:#ffb573;--dark:#6a2f25}
.panel{font:inherit;color:#fff;background:linear-gradient(140deg,var(--tone),var(--dark) 65%);border:2px solid var(--tone);border-radius:11px;position:absolute;inset:0;width:100%;height:100%;z-index:1;transform-origin:left center;transition:transform .55s ease,filter .2s;cursor:pointer;backface-visibility:hidden;box-shadow:inset 0 0 0 5px var(--dark)}
.panel:before{content:"";position:absolute;inset:9% 12%;border:1px solid #ffffff50;border-radius:8px}
.panel:after{content:"";position:absolute;right:13%;top:57%;width:8%;aspect-ratio:1;background:#fff8;border-radius:50%}
.panel span{position:absolute;left:0;right:0;top:23%;font-size:clamp(18px,4vw,36px);font-weight:800}
.panel:disabled{cursor:default}.panel:enabled:hover{filter:brightness(1.25)}
.panel:focus-visible,select:focus-visible,#start:focus-visible{outline:3px solid white;outline-offset:2px}
.slot.selected{outline:3px solid #f7df8f;outline-offset:2px}
.slot.open .panel{transform:rotateY(-105deg);pointer-events:none}
.inside{position:absolute;inset:0;display:grid;place-content:center;text-align:center;justify-items:center;padding:4px;gap:5px;color:#e3cfee;font-size:clamp(10px,2vw,15px);overflow-wrap:anywhere}
.inside img{width:100%;max-width:170px;max-height:110px;object-fit:contain}.inside img[hidden]{display:none}
.slot.prize{background:radial-gradient(ellipse,#72521f,#211329);box-shadow:0 0 20px #eebc4866}
#instructions{text-align:center;margin:14px 4px 0;min-height:1.5em}
.controls{margin-top:14px;padding:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px}
select,#start{font:inherit;color:#fff;border:1px solid #9562c1;border-radius:10px;padding:9px 12px;background:#321d4b}
#start{background:#7639b8;font-weight:750;cursor:pointer}#start:disabled{opacity:.6;cursor:default}
#terms,#notice{flex-basis:100%;margin:0;text-align:center;color:#dac7eb;font-size:14px}
#notice:empty{display:none}#notice{color:#ffbdc9}.rules{margin:18px 0 0;color:#d6c2e8}
@media(prefers-reduced-motion:reduce){.panel{transition:none}}
</style></head><body><main>
<nav><a href="/account">← Главная</a><span id="balance">Баланс: —</span></nav>
<header><h1>Три двери</h1><p>За одной дверью скин. Выбери дверь, дождись, когда откроется пустая, и реши, оставить выбор или поменять его.</p></header>
<section class="stage" aria-label="Игровое поле">
  <div class="doors">${[1, 2, 3].map((n) => `<div class="slot"><div class="inside"><img alt="" hidden><span></span></div><button class="panel" type="button" data-door="${n}" aria-label="Дверь ${n}" disabled><span>${n}</span></button></div>`).join('')}</div>
  <p id="instructions" role="status">Загружаем игру…</p>
</section>
<div class="controls">
  <label for="stake">Вход</label><select id="stake" disabled>${stakes.map((s) => `<option value="${s}">${s} монет</option>`).join('')}</select>
  <button id="start" type="button" disabled>Начать попытку</button>
  <p id="terms"></p><p id="notice" role="alert"></p>
</div>
<p class="rules">Одна попытка каждые два часа. Если поменять дверь, шанс выиграть — 2 из 3. Если оставить — 1 из 3. При проигрыше монеты за вход не возвращаются.</p>
</main><script src="/games/three-doors.js" defer></script></body></html>`;
}

export const threeDoorsScript = String.raw`(() => {
  const stake = document.getElementById('stake');
  const start = document.getElementById('start');
  const notice = document.getElementById('notice');
  const instructions = document.getElementById('instructions');
  const doors = [...document.querySelectorAll('[data-door]')];
  const terms = document.getElementById('terms');
  const errors = {
    authentication_required: 'Войди через Twitch, чтобы сыграть.',
    user_unavailable: 'Для твоего аккаунта игра недоступна.',
    insufficient_coins: 'На балансе не хватает монет.',
    prize_unavailable: 'Сейчас для этой ставки нет скина. Выбери другую сумму.',
    cooldown: 'Время следующей попытки ещё не наступило.',
    invalid_attempt: 'Состояние игры изменилось. Обновили поле.',
    attempt_in_progress: 'Сначала закончи текущую попытку.',
    game_unavailable: 'Игра временно недоступна. Попробуй ещё раз.'
  };
  let state, busy = false, clockOffset = 0;
  let pendingStart;

  function render() {
    const a = state?.attempt;
    const finished = Boolean(a?.finalDoor);
    const active = a && !finished;
    const rest = a ? Math.max(0, Math.ceil((Date.parse(a.nextAt) - Date.now() - clockOffset) / 1000)) : 0;
    const cost = Number(stake.value);
    terms.textContent = 'Скин за ' + cost * 2 + ' монет · продажа из инвентаря за ' + Math.floor(cost * 1.3) + ' монет';
    document.getElementById('balance').textContent = 'Баланс: ' + (state ? state.balance + ' монет' : '—');
    stake.disabled = start.disabled = !state?.canPlay || busy || Boolean(active) || rest > 0;
    if (!state) instructions.textContent = busy ? 'Загружаем игру…' : 'Не удалось загрузить поле.';
    else if (finished) {
      const mins = Math.floor(rest / 60);
      const secs = String(rest % 60).padStart(2, '0');
      instructions.textContent = (a.won ? 'Победа! Скин в инвентаре.' : 'За выбранной дверью пусто.') +
        (rest ? ' Следующая попытка через ' + mins + ':' + secs + '.' : ' Можно начать новую попытку.');
    } else if (!state.canPlay) instructions.textContent = 'Для твоего аккаунта игра недоступна.';
    else if (!a) instructions.textContent = 'Выбери стоимость входа.';
    else if (!a.firstDoor) instructions.textContent = 'Скин за одной из дверей. Выбери дверь.';
    else instructions.textContent = 'Одна дверь пустая. Нажми свою дверь, чтобы остаться, или выбери другую.';

    for (const button of doors) {
      const door = Number(button.dataset.door);
      const slot = button.parentElement;
      const open = finished || a?.emptyDoor === door;
      const prize = finished && a.prizeDoor === door;
      const selected = finished ? a.finalDoor === door : a?.firstDoor === door;
      slot.classList.toggle('open', open);
      slot.classList.toggle('selected', selected);
      slot.classList.toggle('prize', prize);
      button.disabled = !state?.canPlay || busy || !active || open;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', 'Дверь ' + door + (open ? (prize ? ', скин' : ', пусто') : selected ? ', твой выбор' : ''));
      const inside = slot.querySelector('.inside');
      inside.setAttribute('aria-hidden', String(!open));
      inside.querySelector('span').textContent = prize ? [a.prize.name, a.prize.wear].filter(Boolean).join(' · ') : open ? 'Пусто' : '';
      const img = inside.querySelector('img');
      img.hidden = !prize || !a.prize.image;
      if (!img.hidden && img.getAttribute('src') !== a.prize.image) img.src = a.prize.image;
      if (img.hidden && img.hasAttribute('src')) img.removeAttribute('src');
    }
  }

  async function request(action, body) {
    const res = await fetch('/api/me/three-doors' + (action ? '/' + action : ''), body ? {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    } : {cache: 'no-store'});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'authentication_required' : 'game_unavailable'));
    clockOffset = Date.parse(data.serverNow) - Date.now();
    state = data;
  }

  async function act(action, body) {
    if (busy) return;
    busy = true;
    notice.textContent = '';
    render();
    try {
      await request(action, body);
      if (action === 'start') pendingStart = undefined;
    } catch (error) {
      if (['invalid_attempt','attempt_in_progress','cooldown'].includes(error.message)) {
        try { await request(); } catch {}
      }
      notice.textContent = errors[error.message] || errors.game_unavailable;
    } finally {
      busy = false;
      render();
    }
  }

  stake.addEventListener('change', render);
  start.addEventListener('click', () => {
    const cost = Number(stake.value);
    if (pendingStart?.stake !== cost) pendingStart = {stake: cost, id: crypto.randomUUID()};
    void act('start', pendingStart);
  });
  for (const button of doors) button.addEventListener('click', () => {
    const attempt = state?.attempt;
    if (attempt && !attempt.finalDoor) {
      void act(attempt.firstDoor ? 'finish' : 'pick', {id: attempt.id, door: Number(button.dataset.door)});
    }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) void act(); });
  setInterval(() => { if (state?.attempt?.finalDoor) render(); }, 1000);
  void act();
})();`;
