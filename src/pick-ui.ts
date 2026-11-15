import { brandLogoUrl } from './site-branding.js';

export const pickPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pick · Dropso</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;color:#f8efff;background:radial-gradient(ellipse at top,#382050,#130d22 51%,#0b0812);font:16px/1.5 system-ui}
main{width:min(1040px,100%);margin:auto;padding:24px clamp(12px,4vw,38px) 56px}nav{display:flex;justify-content:space-between;gap:12px}a{color:#e3bdff}
header{text-align:center;margin:28px 0 20px}h1{margin:0;font-size:clamp(44px,10vw,84px);line-height:1;letter-spacing:-.045em}header p,.tiers{color:#d3c1e4}
.board{border:1px solid #6c4b91;border-radius:20px;background:#1b112ae0;padding:clamp(8px,3vw,24px)}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(4px,1.7vw,16px)}
.card{min-width:0;aspect-ratio:3/4;position:relative;padding:0;border:0;border-radius:10px;background:none;perspective:850px;color:inherit;font:inherit;cursor:pointer}.card:disabled{cursor:default}
.card:focus-visible,#start:focus-visible{outline:3px solid #fff;outline-offset:3px}
.flip{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.25,.7,.3,1);transition-delay:var(--reveal-delay,0ms)}
.face{position:absolute;inset:0;border:1px solid #a766e2;border-radius:clamp(5px,1.4vw,12px);backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.back{display:grid;place-items:center;background:repeating-linear-gradient(135deg,#ce90ff12 0 1px,transparent 1px 9px),radial-gradient(ellipse,#643a8f,#241639 75%)}
.back:before{content:"";position:absolute;inset:7%;border:1px solid #ca9aff79;border-radius:inherit}.back img{width:58%;max-width:86px;filter:drop-shadow(0 2px 12px #c262ff80)}
.card:enabled:hover .back{border-color:#ecd6ff;box-shadow:0 0 16px #a45cea88}.front{transform:rotateY(180deg);display:grid;align-content:center;justify-items:center;gap:4px;background:radial-gradient(ellipse,#513570,#211430);padding:4%;overflow-wrap:anywhere}
.front img{width:100%;height:clamp(30px,8vw,97px);object-fit:contain}.name{font-size:clamp(8px,1.5vw,14px);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price{font-size:clamp(10px,1.8vw,16px);font-weight:800;color:#f5dba0}
.card.revealed .flip{transform:rotateY(180deg)}.card.chosen .front{border-color:#ffd57a;background:radial-gradient(ellipse,#695022,#302143);box-shadow:0 0 13px #ffd57a80}
#instructions,#notice,.tiers{text-align:center}#instructions{margin:16px 0 0;min-height:1.5em}#notice{color:#ffb7ca}#notice:empty{display:none}
.controls{text-align:center;margin:18px 0}#start{font:inherit;font-weight:750;color:#fff;background:#7841b8;border:1px solid #a677df;border-radius:10px;padding:10px 18px;cursor:pointer}#start:disabled{opacity:.6;cursor:default}
@media(prefers-reduced-motion:reduce){.flip{transition:none}}
</style></head><body><main>
<nav><a href="/account">← Главная</a><span id="balance">Баланс: —</span></nav>
<header><h1>Pick</h1><p>Выбери одну из пяти карт. Скин с неё сразу отправится в инвентарь.</p></header>
<section class="board" aria-label="Пять карт">
<div class="cards">${Array.from({length: 5}, (_, i) => `<button class="card" type="button" data-card="${i + 1}" aria-label="Карта ${i + 1}" disabled><span class="flip"><span class="face back"><img src="${brandLogoUrl}" alt=""></span><span class="face front" aria-hidden="true"><img alt="" hidden><span class="name"></span><span class="price"></span></span></span></button>`).join('')}</div>
<p id="instructions" role="status">Загружаем карты…</p>
</section>
<div class="controls"><p class="tiers" id="tiers"></p><button type="button" id="start" disabled>Раздать карты за 50 монет</button><p id="notice" role="alert"></p></div>
</main><script src="/games/pick.js" defer></script></body></html>`;

export const pickScript = String.raw`(() => {
  const cards = [...document.querySelectorAll('[data-card]')];
  const instructions = document.getElementById('instructions');
  const notice = document.getElementById('notice');
  const start = document.getElementById('start');
  const errors = {
    insufficient_coins: 'Для входа нужно 50 монет.',
    quote_changed: 'Набор призов изменился. Проверь новые цены перед входом.',
    prize_unavailable: 'Сейчас для раскладки не хватает скинов.',
    invalid_attempt: 'Карты уже изменились. Обновили поле.',
    attempt_in_progress: 'Сначала выбери карту в текущей раздаче.',
    user_unavailable: 'Для твоего аккаунта игра недоступна.'
  };
  let state, prices, pendingId, animate = false, busy = false;
  let unlockAt = 0;

  function render() {
    const attempt = state?.attempt;
    const active = attempt && !attempt.chosen;
    const winning = attempt?.cards?.[attempt.chosen - 1];
    document.getElementById('tiers').textContent = prices ? 'Цены скинов: ' + prices.join(' / ') + ' монет' : '';
    document.getElementById('balance').textContent = 'Баланс: ' + (state ? state.balance + ' монет' : '—');
    start.disabled = !state?.canPlay || !prices || busy || Boolean(active) || Date.now() < unlockAt;
    instructions.textContent = !state ? (busy ? 'Загружаем карты…' : 'Не удалось загрузить карты.') :
      winning ? 'Твой скин — ' + winning.name + ' · ' + winning.price + ' монет.' :
      active ? 'Выбери одну карту.' : !prices ? 'Раскладка временно недоступна.' : 'Вход стоит 50 монет.';
    let revealOrder = 0;
    for (const button of cards) {
      const position = Number(button.dataset.card);
      const item = attempt?.cards?.[position - 1];
      const chosen = attempt?.chosen === position;
      button.style.setProperty('--reveal-delay', animate && item && !chosen ? (440 + revealOrder++ * 95) + 'ms' : '0ms');
      button.disabled = !state?.canPlay || !active || busy;
      button.classList.toggle('revealed', Boolean(item));
      button.classList.toggle('chosen', chosen);
      button.setAttribute('aria-label', 'Карта ' + position + (item ? ', ' + item.name + ', ' + item.price + ' монет' : ''));
      const img = button.querySelector('.front img');
      img.hidden = !item?.image;
      if (item?.image && img.getAttribute('src') !== item.image) img.src = item.image;
      if (!item?.image) img.removeAttribute('src');
      button.querySelector('.name').textContent = item ? [item.name, item.wear].filter(Boolean).join(' · ') : '';
      button.querySelector('.price').textContent = item ? item.price + ' мон.' : '';
    }
  }

  async function request(action, body) {
    const response = await fetch('/api/me/pick' + (action ? '/' + action : ''), body ? {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    } : {cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'game_unavailable');
    state = data;
    if (!action || data.prices) prices = data.prices;
  }

  async function act(action, body) {
    if (busy) return;
    busy = true;
    notice.textContent = '';
    render();
    try {
      await request(action, body);
      if (action === 'start') pendingId = undefined;
      animate = action === 'reveal';
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        unlockAt = Date.now() + 1300;
        setTimeout(render, 1350);
      }
    } catch (error) {
      if (['invalid_attempt','attempt_in_progress','quote_changed','prize_unavailable'].includes(error.message)) {
        pendingId = undefined;
        try { await request(); } catch {}
      }
      notice.textContent = errors[error.message] || 'Не удалось выполнить запрос. Попробуй ещё раз.';
    } finally {
      busy = false;
      render();
    }
  }

  start.addEventListener('click', () => {
    if (!prices) return;
    pendingId ||= crypto.randomUUID();
    void act('start', {id:pendingId,value:prices[0]});
  });
  for (const card of cards) card.addEventListener('click', () => {
    if (state?.attempt && !state.attempt.chosen) void act('reveal', {id:state.attempt.id,value:Number(card.dataset.card)});
  });
  window.addEventListener('pageshow', event => { if (event.persisted) void act(); });
  void act();
})();`;
