export const checkersPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Шашки · Dropso</title>
<link rel="stylesheet" href="/live-chat.css"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#120d1d;color:#f8efff;font:16px/1.5 system-ui}main{max-width:1040px;margin:auto;padding:18px clamp(12px,3vw,30px) 50px}a{color:#e8bfff}h1{margin:14px 0}h2{margin:0 0 10px;font-size:19px}p{margin:8px 0}
.layout{display:grid;grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:17px;align-items:start}.pane{padding:14px;border:1px solid #634783;border-radius:14px;background:#211630}.stack{display:grid;gap:10px}
form,label{display:grid;gap:6px}form{gap:10px}input,select,button{min-width:0;min-height:42px;background:#33204c;color:#fff;border:1px solid #8c60bb;border-radius:8px;padding:6px 9px;font:inherit}button{cursor:pointer}button:disabled{opacity:.6;cursor:default}button:focus-visible,a:focus-visible{outline:3px solid #fff9c9;outline-offset:2px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.actions>*{flex:1 1 auto}.muted{color:#d8c3e8}#notice{color:#ffb5c7;min-height:1.5em}
.board{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));width:100%;aspect-ratio:1;border:6px solid #3d281d;border-radius:6px;overflow:hidden;margin-top:10px;background:#3d281d}
.square{min-height:0;aspect-ratio:1;border:0;padding:0;border-radius:0;display:grid;place-items:center;position:relative}
.square:disabled{opacity:1}.square.light{background:#e5c9a2}.square.dark{background:#80563d}.square[aria-pressed=true]{box-shadow:inset 0 0 0 3px #f8e084}
.piece{width:74%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;border:3px double currentColor;box-shadow:0 3px 4px #0008;font-size:clamp(14px,4vw,29px)}
.piece.w{color:#8c6238;background:radial-gradient(circle at 30% 20%,#fffef2,#e4be87)}.piece.b{color:#d2a170;background:radial-gradient(circle at 30% 20%,#65452e,#211710)}.taken{opacity:.38}
.rooms{list-style:none;padding:0;margin:0}.rooms a{display:block;padding:8px 0;border-bottom:1px solid #513568}.dropso-live-chat{margin:0}
@media(max-width:710px){.layout{grid-template-columns:1fr}}
</style></head><body><main>
<a id="lobbyLink" href="/games/checkers">Все комнаты</a> · <a href="/games">Игры</a>
<h1>Шашки</h1><p id="notice" role="status"></p>
<section id="lobby" class="layout" hidden>
  <div class="pane"><h2>Создать комнату</h2>
    <p id="balance" class="muted"></p>
    <form id="create"><label>Ставка в монетах<input name="stake" type="number" min="1" max="100" value="10" required></label>
    <label>Оплата<select name="skin"></select></label>
    <label>Пароль для приватной комнаты<input name="password" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="Пусто — открытая комната"></label>
    <button type="submit">Создать комнату</button></form>
  </div>
  <div class="pane"><h2>Комнаты</h2><ul id="rooms" class="rooms"></ul></div>
</section>
<section id="room" class="layout" hidden>
  <div class="pane">
    <h2 id="players"></h2><p id="matchStatus"></p><p id="clock" class="muted"></p>
    <div id="board" class="board" aria-label="Шашечная доска"></div>
    <form id="join" hidden><label id="joinPassword">Пароль<input name="password" type="password" maxlength="64" autocomplete="off"></label>
      <label>Оплата<select name="skin"></select></label><button type="submit">Присоединиться</button>
    </form>
    <div class="actions"><button id="share" type="button" hidden>Скопировать ссылку</button>
      <button id="draw" type="button" hidden>Предложить ничью</button><button id="leave" type="button" hidden>Сдаться</button></div>
  </div>
  <section class="dropso-live-chat" data-chat-panel="room" data-chat-participant="false" data-room="" hidden>
    <h2>Чат комнаты</h2><ol aria-label="Сообщения"></ol><form><input name="message" maxlength="140" aria-label="Сообщение" required><button type="submit">Отправить</button></form><p role="status"></p>
  </section>
</section>
<section class="pane" style="margin-top:16px"><h2>Правила</h2>
  <p>Русские шашки 8×8, один на один со ставкой от 1 до 100 монет. Белые ходят первыми. Обычная шашка ходит вперёд по диагонали, бьёт в обе стороны и становится дамкой на последней горизонтали. Дамка ходит по диагонали на любое свободное расстояние. Взятие обязательно. Серия взятий продолжается той же фигурой.</p>
  <p>На весь ход даётся одна минута. Если время вышло, игрок сдался или у него закончились ходы, побеждает соперник. Победитель получает 90% общего банка с округлением вниз до целой монеты. Остальное удерживается как комиссия в 10% с учётом округления.</p>
  <p>Скин можно использовать по точной цене его продажи. Он сразу продаётся, а выручка идёт в банк. При ничьей, отмене или истечении 15 минут ожидания соперника ставка возвращается монетами.</p>
</section>
</main><script src="/games/checkers.js" defer></script><script src="/live-chat.js" defer></script></body></html>`;

export const checkersScript = String.raw`(() => {
  const el = id => document.getElementById(id);
  const create = el('create'), join = el('join'), board = el('board'), notice = el('notice');
  const panel = document.querySelector('[data-chat-panel]');
  const roomId = new URLSearchParams(location.search).get('room');
  const endpoint = '/api/me/checkers';
  const errors = {
    invalid_stake:'Введи целое число от 1 до 100.',
    invalid_skin:'Скин уже недоступен или его цена отличается от ставки.',
    insufficient_coins:'На балансе не хватает монет.',
    wrong_password:'Неверный пароль.',
    room_closed:'Комната уже закрыта.',
    room_not_found:'Комната не найдена.',
    user_unavailable:'Для твоего аккаунта ставка недоступна.',
    not_participant:'Эта партия уже началась.',
    invalid_move:'Так ходить нельзя. Проверь, есть ли обязательное взятие.',
    stale_move:'Положение изменилось. Попробуй снова.',
    not_your_turn:'Сейчас ход соперника.',
    already_in_room:'Сначала закончи текущую партию или закрой комнату.',
    too_many_attempts:'Слишком много попыток. Подожди минуту.'
  };
  let room, list, selected = null, offset = 0, busy = false, polling = false, pendingId, lastBoard = '';
  function roomUrl(id) { return '/games/checkers?room=' + encodeURIComponent(id); }
  function open(id) { location.assign(roomUrl(id)); }
  async function request(url, body) {
    const res = await fetch(url, body === undefined ? {cache:'no-store'} : {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || 'game_unavailable');
    return data;
  }
  function payment(select, price) {
    const previous = select.value;
    const number = document.createElement('option');
    number.value = ''; number.textContent = 'Монетами';
    const options = (list?.skins || []).filter(skin => skin.price === Number(price)).map(skin => {
      const option = document.createElement('option');
      option.value = skin.id; option.textContent = 'Продать ' + skin.name + ' за ' + skin.price + ' мон.';
      return option;
    });
    select.replaceChildren(number,...options);
    if (options.some(option => option.value === previous)) select.value = previous;
  }
  function renderLobby() {
    el('balance').textContent = 'Баланс: ' + list.balance + ' монет';
    payment(create.elements.skin, create.elements.stake.value);
    const links = list.rooms.map(item => {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = roomUrl(item.id);
      a.textContent = item.host + ' · ' + item.stake + ' мон. · ' + (item.private ? 'с паролем' : 'открытая');
      li.append(a); return li;
    });
    if (list.mine) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = roomUrl(list.mine); a.textContent = 'Вернуться в мою комнату';
      li.append(a); links.unshift(li);
    }
    el('rooms').replaceChildren(...links);
    if (!links.length) el('rooms').textContent = 'Пока нет открытых комнат.';
  }
  function clock() {
    if (!room || !['waiting','active'].includes(room.status)) { el('clock').textContent = ''; return; }
    const seconds = Math.max(0,Math.ceil((Date.parse(room.deadline)-Date.now()-offset)/1000));
    el('clock').textContent = (room.status === 'waiting' ? 'Ожидание: ' : 'До конца хода: ') +
      Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0');
  }
  function renderBoard() {
    if (!room) return;
    const mine = room.status === 'active' && room.side === room.turn;
    const key = [room.revision,room.status,room.side,selected].join(':');
    if (lastBoard === key) return;
    lastBoard = key;
    const cells = Array.from({length:64},(_,index) => room.side === 'b' ? 63-index : index);
    board.replaceChildren(...cells.map(i => {
      const square = document.createElement('button');
      const dark = (Math.floor(i/8) + i%8)%2 === 1;
      const piece = room.board[i];
      square.className = 'square ' + (dark ? 'dark' : 'light');
      square.type = 'button'; square.disabled = !dark || !mine; square.dataset.cell = i;
      square.setAttribute('aria-label','abcdefgh'[i%8] + (8-Math.floor(i/8)) + (piece ? ', ' +
        (piece.toLowerCase()==='w' ? 'белая' : 'чёрная') + ' ' + (piece===piece.toUpperCase()?'дамка':'шашка') : ''));
      square.setAttribute('aria-pressed',String(i===selected));
      if (piece) {
        const token = document.createElement('span');
        token.className = 'piece ' + piece.toLowerCase() + (room.captured.includes(i) ? ' taken' : '');
        if (piece === piece.toUpperCase()) token.textContent = '♛';
        square.append(token);
      }
      return square;
    }));
  }
  function renderRoom(next) {
    if (room && Date.parse(next.now) < Date.parse(room.now)) return;
    if (!room || next.revision !== room.revision || next.status !== room.status) selected = next.forced;
    room = next;
    offset = Date.parse(room.now) - Date.now();
    const own = Boolean(room.side), waiting = room.status === 'waiting', active = room.status === 'active';
    el('players').textContent = room.host + ' · ' + (room.guest || 'ожидает соперника');
    const result = room.status === 'draw' ? 'Ничья. Ставки возвращены.' :
      room.status === 'cancelled' ? 'Комната закрыта. Ставка возвращена.' :
      room.winner === room.side ? 'Ты победил! На баланс начислено ' + Math.floor(room.stake*18/10) + ' монет.' : 'Победил соперник.';
    el('matchStatus').textContent = 'Ставка: ' + room.stake + ' мон. · ' + (waiting ? 'Ожидаем второго игрока.' :
      active ? (room.turn === room.side ? (room.forced === null ? 'Твой ход.' : 'Продолжи взятие той же шашкой.') : 'Ход соперника.') : result);
    join.hidden = own || !waiting;
    el('joinPassword').hidden = !room.private;
    if (!join.hidden && !join.elements.skin.options.length) payment(join.elements.skin, room.stake);
    el('share').hidden = !own || !waiting;
    el('leave').hidden = !own || !(waiting || active);
    el('leave').textContent = waiting ? 'Закрыть комнату' : 'Сдаться';
    el('draw').hidden = !own || !active;
    el('draw').disabled = room.drawBy === room.side;
    el('draw').textContent = room.drawBy ? room.drawBy === room.side ? 'Ничья предложена' : 'Принять ничью' : 'Предложить ничью';
    panel.dataset.room = own ? room.id : '';
    panel.dataset.chatParticipant = String(own);
    renderBoard();clock();
  }
  async function refresh() {
    if (busy || polling || document.hidden) return;
    polling = true;
    try {
      if (roomId) {
        const next = await request(endpoint + '?room=' + encodeURIComponent(roomId));
        if (!next.side && next.status === 'waiting' && !list) list = await request(endpoint);
        renderRoom(next);
        el('room').hidden = false;
      } else {
        list = await request(endpoint);
        renderLobby();
        el('lobby').hidden = false;
      }
    } catch (error) {
      notice.textContent = errors[error.message] || 'Не удалось загрузить шашки.';
    } finally { polling = false; }
  }
  async function act(id, action, data = {}) {
    if (busy) return;
    notice.textContent = '';
    busy = true;
    try {
      const next = await request(endpoint+'/'+encodeURIComponent(id)+'/'+action,data);
      if (action === 'create') open(next.id);
      else if (action === 'join') await request(endpoint+'?room='+encodeURIComponent(id)).then(renderRoom);
      else renderRoom(next);
    } catch (error) {
      if (action === 'create' && errors[error.message]) pendingId = undefined;
      notice.textContent = errors[error.message] || 'Не удалось выполнить действие. Попробуй ещё раз.';
    } finally { busy = false; }
  }
  create.elements.stake.addEventListener('input', () => payment(create.elements.skin,create.elements.stake.value));
  create.addEventListener('submit', event => {
    event.preventDefault();
    pendingId ||= crypto.randomUUID();
    void act(pendingId,'create',{stake:Number(create.elements.stake.value),password:create.elements.password.value,skin:create.elements.skin.value || null});
  });
  join.addEventListener('submit', event => {
    event.preventDefault();
    void act(roomId,'join',{password:join.elements.password.value,skin:join.elements.skin.value || null});
  });
  board.addEventListener('click', event => {
    const button = event.target.closest('[data-cell]');
    if (!button || busy || !room) return;
    const cell = Number(button.dataset.cell), piece = room.board[cell];
    if (piece.toLowerCase() === room.side && (room.forced === null || room.forced === cell)) {
      selected = cell; renderBoard(); return;
    }
    if (!piece && selected !== null) void act(room.id,'move',{from:selected,to:cell,revision:room.revision});
  });
  el('draw').onclick = () => void act(roomId,'draw');
  el('leave').onclick = async () => {
    if (await window.dropsoConfirm(room.status === 'waiting' ? 'Закрыть комнату и вернуть ставку?' : 'Сдаться? Банк получит соперник.'))
      void act(roomId,'leave');
  };
  el('share').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); notice.textContent = 'Ссылка скопирована.'; }
    catch { notice.textContent = 'Скопируй адрес комнаты из адресной строки.'; }
  };
  void refresh();
  setInterval(refresh,roomId ? 3000 : 9000);
  setInterval(clock,250);
})();`;
