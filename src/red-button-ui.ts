import {brandLogoUrl} from './site-branding.js';
export const redButtonPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Красная кнопка · Dropso</title>
<link rel="stylesheet" href="/live-chat.css"><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;color:#f9edf3;background:radial-gradient(ellipse at 50% 15%,#43192d,#140d20 55%,#0c0913);font:16px/1.55 system-ui}
main{max-width:1020px;margin:auto;padding:22px 14px 52px}a{color:#e9c6ff}h1{font-size:clamp(32px,6vw,61px);margin:5px 0 14px;line-height:1.1}h2{font-size:19px;margin:0 0 8px}
.layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px;align-items:start}
.panel{background:#211429;border:1px solid #644578;border-radius:18px;padding:15px;margin:0 0 14px}.stage{text-align:center;display:grid;justify-items:center;gap:5px}
.stage img{max-width:100%;width:320px;height:110px;object-fit:contain}#image{height:155px;width:min(100%,320px);filter:drop-shadow(0 8px 18px #0007)}.stage p{margin:3px 0}.clock{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#ffe4a5}
.press{display:grid;justify-items:center;width:min(100%,370px);margin:8px 0 14px;padding:0 8px 7px;border:0;border-radius:17px;background:transparent;color:#fff;font:800 17px/1.25 system-ui;cursor:pointer}
.press-art{display:block;width:100%;filter:drop-shadow(0 12px 22px #ef345d78);transition:transform .15s ease,filter .15s ease}
.stage .press img{display:block;width:100%;height:auto;clip-path:url(#redButtonCutout)}
.press:enabled:hover .press-art{filter:drop-shadow(0 14px 25px #fb346ca8) brightness(1.1)}
.press:enabled:active .press-art{transform:translateY(6px) scale(.965)}
.press:disabled .press-art{opacity:.67;filter:drop-shadow(0 8px 14px #b83a7479)}
.press:disabled{cursor:default}.press:focus-visible{outline:3px solid white;outline-offset:3px}
.press-label{padding:6px 12px;background:#36192c;border:1px solid #a34462;border-radius:8px}
@media(prefers-reduced-motion:reduce){.press-art{transition:none}}
#notice{color:#ffadc4}.muted{color:#d5bad7}table{border-collapse:collapse;width:100%;font-size:14px;text-align:left}td,th{border-bottom:1px solid #604263;padding:7px 4px;overflow-wrap:anywhere}th:last-child,td:last-child{text-align:right}
.dropso-live-chat{margin:0 0 14px}@media(max-width:700px){.layout{grid-template-columns:1fr}}
.jackpot-bank{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0;text-align:left}.jackpot-bank>div{min-width:0;padding:10px;border:1px solid #835370;border-radius:12px;background:#31192d}.jackpot-bank span,.jackpot-bank small{display:block;color:#e1bad9;font-size:12px}.jackpot-bank strong{display:block;color:#ffe4a5;font-size:clamp(20px,4vw,29px);line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.jackpot-bonus{grid-column:1/-1}.jackpot-bonus progress{width:100%;height:8px;accent-color:#f55383}.jackpot-bonus[data-active="true"]{border-color:#e19b57}

/* Red Button: the live controls are shared; this layer is visual only. */
body[data-dropso-redesign=red-button] .red-button-main{position:relative;isolation:isolate;container-type:inline-size;max-width:1720px!important;width:100%;padding:0 0 30px!important;min-width:0}
.red-button-heading{position:relative;text-align:center;padding:8px 12px 20px;isolation:isolate;overflow:hidden}
.red-button-heading:before{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 50% 95%,#f6226030,transparent 51%),linear-gradient(165deg,transparent 56%,#4d1f752e 57%,transparent 70%);pointer-events:none}
.red-button-heading:after{content:'';position:absolute;z-index:-1;left:8%;right:8%;height:95px;top:45px;border-radius:50%;border-top:2px solid #db254c;filter:drop-shadow(0 0 10px #ff234d);mask-image:linear-gradient(90deg,transparent,#000 20%,transparent 38%,transparent 62%,#000 80%,transparent);pointer-events:none}
.red-button-heading .red-button-back{position:absolute;left:8px;top:22px;display:inline-flex;align-items:center;padding:7px 14px;border:1px solid #64527b;border-radius:10px;background:#21172c;color:#fff;text-decoration:none;font-weight:700;font-size:13px}
.red-button-heading .red-button-brand{display:inline-flex;align-items:center;gap:4px;color:#fff;text-decoration:none;font-size:17px;font-style:italic;font-weight:850;line-height:1}
.red-button-heading .red-button-brand img{width:27px;height:27px;object-fit:contain}
.red-button-heading h1{margin:3px 0 0!important;color:#f8f4ff;font-size:clamp(29px,4.3cqi,49px)!important;line-height:1.1;font-style:italic;font-weight:950;letter-spacing:.005em;text-shadow:0 5px 18px #0009}
.red-button-heading h1 span{color:#fa3450;text-shadow:0 0 22px #f5265440}
.red-button-heading>p{margin:4px 0 0;font-weight:800;color:#c774fa;font-size:13px;letter-spacing:.38em}
body[data-dropso-redesign=red-button] .red-button-main .layout{grid-template-columns:minmax(0,1.42fr) minmax(0,1fr)!important;gap:14px!important;align-items:start}
body[data-dropso-redesign=red-button] .red-button-main .panel,body[data-dropso-redesign=red-button] .red-button-main .dropso-live-chat{border:1px solid #694c83!important;border-radius:16px!important;background:radial-gradient(ellipse at 15% 0,#5c28682b,transparent 50%),linear-gradient(155deg,#211529,#161221 72%)!important;box-shadow:inset 0 1px 1px #d5a0fe35!important;min-width:0;margin:0}
body[data-dropso-redesign=red-button] .red-button-main .stage{position:relative;overflow:hidden;isolation:isolate;gap:3px;padding:15px 24px 17px!important;border-color:#a34a70!important;background:radial-gradient(ellipse at 0% 25%,#d5234b29,transparent 34%),radial-gradient(ellipse at 100% 25%,#d5234b29,transparent 34%),radial-gradient(ellipse at 50% 80%,#8c215834,transparent 45%),#191222!important;box-shadow:inset 0 0 18px #ff346022!important}
.red-button-main .red-prize-kicker{padding:2px 26px;background:linear-gradient(90deg,#3a1834,#4b2145,#3a1834);border:1px solid #a35a8c;border-radius:30px;font-size:13px}
.red-button-main .stage #image{width:min(100%,205px);height:91px;object-fit:contain;filter:drop-shadow(0 0 18px #9c38d26e)}
.red-button-main #prize{font-size:15px;font-weight:850;line-height:1.25}
.red-button-main #prizeValue{font-size:17px;line-height:1.2;margin:0}
.red-button-main #countdown{display:flex;align-items:center;justify-content:center;gap:9px;width:min(100%,345px);padding:5px 10px;border:1px solid #d94a6d;background:#4b192f80;border-radius:22px;color:#ffe3a0;font-size:15px;box-shadow:0 0 10px #f3375038;margin:7px 0 1px}
.red-button-main #countdown:empty{display:none}
.red-button-main #countdown:before{content:'◷';font-size:20px;line-height:1}
.red-button-main #holder,.red-button-main #playerCount{font-size:13px;margin:0;line-height:1.4}
.red-button-main #pressRemaining{font-size:16px;margin:2px 0 5px}
.red-button-main .jackpot-bank{gap:8px;margin:5px 0 0}
body[data-dropso-redesign=red-button] .red-button-main .jackpot-bank>div{position:relative;background:linear-gradient(100deg,#491d38,#271a32 75%)!important;border-color:#80516f!important;border-radius:10px;padding:7px 10px 7px 55px;min-height:53px;box-shadow:inset 0 1px 1px #ff9db82e}
.red-button-main .jackpot-bank>div:before{content:'';position:absolute;left:17px;top:50%;transform:translateY(-50%);width:24px;height:24px;background:#d5a2f4;mask:var(--rb-icon) center/contain no-repeat}
.red-button-main .jackpot-bank span{font-size:12px;color:#f5e8fb;line-height:1.35}
.red-button-main .jackpot-bank strong{font-size:23px;line-height:1.05;color:#ffe394}
.red-button-main .jackpot-bonus{padding-top:9px!important;padding-bottom:9px!important}
.red-button-main .jackpot-bonus span{font-weight:750}
.red-button-main .jackpot-bonus progress{display:block;width:100%;height:8px;background:#735b76;border:0;border-radius:10px;margin:8px 0 5px;overflow:hidden;appearance:none}
.red-button-main .jackpot-bonus progress::-webkit-progress-bar{background:#665369;border-radius:10px}
.red-button-main .jackpot-bonus progress::-webkit-progress-value{background:linear-gradient(90deg,#fa5d9b,#ff87bd);border-radius:10px}
.red-button-main .jackpot-bonus progress::-moz-progress-bar{background:#fa6aaa;border-radius:10px}
.red-button-main .jackpot-bonus small{font-size:11px}
.red-button-main .jackpot-bonus[data-active=true]{border-color:#f3bd75!important}
.red-button-main #press{position:relative;width:min(100%,360px);margin:0;padding:0 0 2px;gap:2px;filter:none!important}
.red-button-main #press:before{content:'';position:absolute;z-index:-1;left:-35%;right:-35%;bottom:12px;height:130px;background:radial-gradient(ellipse,#a92b784b,transparent 60%);border-radius:50%;pointer-events:none}
.red-button-main .press-art{position:relative;width:min(100%,330px);height:152px;overflow:visible;filter:drop-shadow(0 5px 19px #f5367266)}
.red-button-main .stage .press img{position:absolute;width:100%;height:auto;left:0;top:-36px}
.red-button-main .press-label{display:block;width:100%;background:linear-gradient(180deg,#f74a64,#b81937 70%,#9b142f);border:1px solid #ff7389;border-radius:13px;padding:10px 12px;color:#fff;font-size:16px;box-shadow:inset 0 1px 4px #ffb2ba77,0 0 16px #e82d4759}
.red-button-main #press:disabled .press-label{background:#4d263d;box-shadow:none;color:#d7a9bf;border-color:#825069}
.red-button-main #notice:empty{display:none}
.red-button-main .red-button-side{display:grid;gap:14px;min-width:0}
.red-button-main .red-button-side h2,.red-button-main .red-rules h2{font-size:17px;font-weight:850;display:flex;align-items:center;gap:9px}
.red-button-main .red-button-side h2:before,.red-button-main .red-rules h2:before{content:'';width:23px;height:23px;background:#ce97f8;flex:none;mask:var(--rb-icon) center/contain no-repeat}
.red-button-main .dropso-live-chat{padding:13px!important}
.red-button-main .dropso-live-chat ol{height:165px;max-height:235px;min-height:120px;overflow:auto;background:#15101e;border:1px solid #4d385f;border-radius:9px;padding:5px 10px;margin:0;list-style:none}
.red-button-main .dropso-live-chat form{display:flex;gap:8px;margin:7px 0 0}
.red-button-main .dropso-live-chat form[hidden]{display:none!important}
.red-button-main .dropso-live-chat input{min-width:0;width:100%;flex:1;background:#14101c;border:1px solid #70568a;border-radius:8px;color:#fff;padding:7px 10px;font:inherit;font-size:13px}
.red-button-main .dropso-live-chat button{background:linear-gradient(#9145ba,#5c2980);border:1px solid #9b65bf;border-radius:8px;color:white;font-weight:700;min-height:34px;font-size:12px}
.red-button-main .dropso-live-chat [role=status]:empty{display:none}
.red-button-main .red-history{padding:15px!important}
.red-button-main .red-history-scroll{max-height:365px;overflow:auto;scrollbar-color:#9b45d3 #22162d;scrollbar-width:thin}
.red-button-main .red-history table{width:100%;table-layout:fixed;font-size:12px;line-height:1.35}
.red-button-main .red-history th{position:sticky;top:0;background:#24182e;font-size:11px;z-index:1}
.red-button-main .red-history th:first-child{width:21%}
.red-button-main .red-history th:last-child{width:29%}
.red-button-main .red-history td,.red-button-main .red-history th{padding:6px 6px;border-bottom:1px solid #46364e;overflow-wrap:anywhere}
.red-button-main .red-history tbody tr:nth-child(odd){background:#1b1525}
.red-button-main .red-rules{margin-top:14px!important;display:grid;grid-template-columns:180px minmax(0,1fr);gap:22px;padding:16px 22px!important}
.red-button-main .red-rules h2{align-self:start;margin:4px 0}
.red-button-main .red-rules-copy{border-left:1px solid #90506d;padding-left:22px;font-size:13px;line-height:1.45}
.red-button-main .red-rules-copy p{margin:0 0 8px}
.red-button-main .red-rules-copy p:last-child{margin:0}
@container(max-width:800px){body[data-dropso-redesign=red-button] .red-button-main .layout{grid-template-columns:minmax(0,1fr)!important}.red-button-main .red-rules{grid-template-columns:1fr;gap:8px}.red-button-main .red-rules-copy{border-left:0;padding-left:0}.red-button-main .red-button-heading .red-button-back{position:static;display:table;margin:0 0 8px}.red-button-main .red-button-heading h1{font-size:clamp(25px,5.7cqi,42px)!important}}
@container(max-width:480px){body[data-dropso-redesign=red-button] .red-button-main .stage{padding:12px!important}.red-button-main .jackpot-bank strong{font-size:20px}.red-button-main .jackpot-bank>div:before{left:9px;width:19px;height:19px}body[data-dropso-redesign=red-button] .red-button-main .jackpot-bank>div{padding-left:35px}.red-button-main .red-history table{font-size:11px}.red-button-main .press-art{height:142px}.red-button-main .stage .press img{top:-28px}}
.red-button-main .jackpot-bank>div:nth-child(1){--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M5%203h14v7a7%207%200%200%201-14%200ZM5%205H2v4a4%204%200%200%200%204%204m13-8h3v4a4%204%200%200%201-4%204m-6%204v4m-5%200h10%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .jackpot-bank>div:nth-child(2){--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m4%205%208%207-8%207m8-14%208%207-8%207%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .jackpot-bank>div:nth-child(3){--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%206c0-4%2018-4%2018%200S3%2010%203%206Zm0%200v6c0%204%2018%204%2018%200V6M3%2012v5c0%204%2018%204%2018%200v-5%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .jackpot-bank>div:nth-child(4){--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%2012a9%209%200%201%201%203%207M3%204v8h8%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .jackpot-bonus{--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%208h18v4H3Z%20M5%2012v9h14v-9M12%208v13M12%208C4%208%205%201%209%204l3%204Zm0%200c8%200%207-7%203-4Z%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .dropso-live-chat h2{--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%204h18v13H9l-6%204ZM12%2010h.01%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .red-history h2{--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%2012a9%209%200%201%201%203%207M3%204v8h8M12%207v5l4%202%22%2F%3E%3C%2Fsvg%3E")}
.red-button-main .red-rules h2{--rb-icon:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%202a10%2010%200%201%200%200%2020%2010%2010%200%201%200%200-20Zm0%209v6m0-10h.01%22%2F%3E%3C%2Fsvg%3E")}
</style></head><body><main class="red-button-main">
<header class="red-button-heading"><a class="red-button-back" href="/games">← Игры</a><a class="red-button-brand" href="/account"><img src="${brandLogoUrl}" alt="">Dropso</a><h1>КРАСНАЯ <span>КНОПКА</span></h1><p>RED BUTTON</p></header>
<div class="layout"><div>
<section class="panel stage" aria-label="Текущий раунд">
  <p class="red-prize-kicker muted">Приз текущего раунда</p><img id="image" hidden alt=""><strong id="prize">Загрузка…</strong><p id="prizeValue" hidden class="clock"></p>
  <p id="countdown" class="clock"></p><p id="holder" class="muted"></p><p id="playerCount" class="muted"></p><p id="pressRemaining" class="clock" hidden></p>
  <div class="jackpot-bank" id="jackpotBank" hidden><div><span>Приз победителя</span><strong id="winnerPrize">—</strong></div><div><span>В следующий раунд</span><strong id="nextBank">—</strong></div><div><span>Общий банк</span><strong id="totalBank">—</strong></div><div><span>Перенесено из прошлого раунда</span><strong id="carryIn">—</strong></div><div class="jackpot-bonus" id="jackpotBonus"><span id="bonusStatus"></span><progress id="bonusProgress" max="10" value="0" aria-label="Участники до включения бонуса Dropso"></progress><small id="bonusAmount"></small></div></div>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><clipPath id="redButtonCutout" clipPathUnits="objectBoundingBox"><path d="M .494 .181 C .602 .179 .688 .272 .711 .373 C .768 .420 .805 .520 .805 .633 C .805 .771 .661 .891 .493 .891 C .332 .890 .177 .793 .177 .645 C .177 .528 .218 .423 .277 .379 C .312 .274 .398 .181 .494 .181 Z"/></clipPath></defs></svg>
  <button type="button" id="press" class="press" disabled><span class="press-art"><img src="/games/red-button/button-v1.webp" width="768" height="512" alt=""></span><span id="pressLabel" class="press-label">Загрузка условий…</span></button>
  <p id="notice" role="status"></p>
</section>
</div><div class="red-button-side">
<section class="dropso-live-chat" data-chat-panel="room" data-chat-moderator-write="true" data-chat-participant="false" data-room="" hidden>
  <h2>Чат раунда</h2><ol aria-label="Сообщения"></ol><form><input name="message" maxlength="140" aria-label="Сообщение" placeholder="Сообщение" required><button type="submit">Отправить</button></form><p role="status"></p>
</section>
<section class="panel red-history"><h2>Прошлые игры</h2><div class="red-history-scroll"><table><thead><tr><th>Ник</th><th>Приз</th><th>Время удержания кнопки</th></tr></thead><tbody id="history"></tbody></table></div><p id="noHistory" class="muted">Пока нет завершённых раундов с победителем.</p></section>
</div></div>
<section class="panel red-rules"><h2>Как играть</h2><div class="red-rules-copy"><p>Вход в раунд стоит <b id="ruleEntry">—</b> монет. Первое нажатие оплачивает вход и передаёт кнопку тебе. После каждого успешного нажатия нужно подождать <b id="ruleCooldown">—</b> минут. <span id="holdRule">Если кнопку ещё никто не перехватил, ты продолжаешь держать её.</span></p><p id="legacyPrize">Призы: скины стоимостью от 50 до <b id="rulePrizeMax">—</b> монет.</p><p id="modernPrize" hidden>Один вход на 48 часов. Приз обновляется по мере вступления участников. Если подходящего скина нет, победитель получает монеты.</p><p id="jackpotRules" hidden>Каждый раунд длится 24 часа. Взносы и накопления формируют банк: 80% — бюджет скина победителя, 20% — в следующий раунд. Выбирается самый дорогой доступный скин в пределах бюджета. Остаток после округления вниз переносится в следующий раунд. Начиная с 11-го участника Dropso добавляет по 10 монет в приз и ещё 10 в следующий раунд за каждого нового участника. За первых 10 бонус не начисляется. Если победителя нет, весь банк переносится дальше.</p><p>Время всех твоих удержаний за раунд складывается. Побеждает игрок с наибольшей суммой. При равенстве побеждает тот, кто раньше впервые перехватил кнопку. Время победителя появится в истории после раунда.</p></div></section>
</main><script src="/games/red-button.js" defer></script><script src="/live-chat.js" defer></script></body></html>`;

export const redButtonScript = String.raw`(() => {
  const el = id => document.getElementById(id);
  const button = el('press');
  const chat = document.querySelector('[data-chat-panel]');
  const failures = {
    user_unavailable:'Для твоего аккаунта участие недоступно.',
    insufficient_coins:'Недостаточно монет для входа.',
    cooldown:'До следующего нажатия ещё нужно подождать.',
    press_limit:'Все 6 нажатий за раунд использованы.',
    already_holding:'Кнопка уже у тебя.',
    round_closed:'Раунд завершился. Обновляем приз.'
  };
  let state, offset = 0, pending, busy = false, loading = false;
  const terms = () => ({entryCost:state?.rules?.entryCost===15?15:state?.rules?.entryCost===20?20:10,cooldownMinutes:state?.rules?.cooldownMinutes===30?30:state?.rules?.cooldownMinutes===60?60:20,prizeMax:state?.rules?.prizeMax===200?200:300,modern:state?.rules?.roundHours===48||state?.rules?.jackpot===true,jackpot:state?.rules?.jackpot===true});
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
    const limit=state?.rules?.pressLimit, remaining=round?.pressesRemaining;
    const limited=Number.isInteger(limit)&&Number.isInteger(remaining);
    el('pressRemaining').hidden=!limited;
    el('pressRemaining').textContent=limited?'Осталось нажатий: '+remaining+'/'+limit:'';
    button.disabled = !state?.canPlay || !round || !left || busy || round.holding || wait > 0 || (limited&&remaining===0);
    el('pressLabel').textContent = limited&&remaining===0 ? 'Лимит нажатий исчерпан' : !round?.joined ? 'Войти за '+terms().entryCost+' монет и нажать' : wait ? 'Нажатие через ' + duration(wait) : round.holding
      ? 'Кнопка у тебя' : round.holder ? 'Перехватить кнопку' : 'Занять кнопку';
  }
  function render() {
    const round = state.round;
    const rules=terms();el('ruleEntry').textContent=rules.entryCost;el('ruleCooldown').textContent=rules.cooldownMinutes;el('rulePrizeMax').textContent=rules.modern?'':rules.prizeMax;
    el('legacyPrize').hidden=rules.modern;el('modernPrize').hidden=!rules.modern||rules.jackpot;el('jackpotRules').hidden=!rules.jackpot;el('jackpotBank').hidden=!rules.jackpot||!round;
    if(rules.jackpot&&round){const coins=n=>Number.isSafeInteger(n)?n.toLocaleString('ru-RU'):'—';el('winnerPrize').textContent=coins(round.winnerPrize);el('nextBank').textContent=coins(round.nextBank);el('totalBank').textContent=coins(round.bank);el('carryIn').textContent=coins(round.carryIn);const n=round.playerCount||0,active=n>10;el('jackpotBonus').dataset.active=String(active);el('bonusProgress').value=Math.min(n,10);el('bonusStatus').textContent=active?'Бонус Dropso активен':n===10?'Следующий участник активирует бонус Dropso':'До бонуса Dropso: ещё '+(11-n)+' участников';el('bonusAmount').textContent=active?'+'+coins(round.dropsoBonusEach)+' в приз и +'+coins(round.dropsoBonusEach)+' в следующий раунд':'За каждого участника после 10-го: +10 / +10 монет';}
    el('holdRule').textContent=(rules.modern?'Кнопка освобождается не позднее чем через 15 минут или при перехвате другим игроком.':'Если кнопку ещё никто не перехватил, ты продолжаешь держать её.')+(state.rules?.pressLimit?' Не более '+state.rules.pressLimit+' успешных нажатий за раунд, включая первое. Неиспользованные нажатия не переносятся.':'');
    el('prize').textContent = round?.prize ? round.prize+(round.wear?' · '+round.wear:'') : 'Раунд пока недоступен';
    el('prizeValue').hidden=!(rules.jackpot&&round?.image&&Number.isSafeInteger(round.price));
    el('prizeValue').textContent=el('prizeValue').hidden?'':round.price.toLocaleString('ru-RU')+' монет';
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
      el('notice').textContent = error.message==='insufficient_coins'?'Для входа нужно '+terms().entryCost+' монет.':failures[error.message] || 'Не удалось обновить раунд. Попробуй ещё раз.';
    } finally { loading = false; }
  }
  button.addEventListener('click', async () => {
    if (busy || loading || button.disabled || !state?.round) return;
    busy = true;
    clock();
    try {
      if (!state.round.joined && !await window.dropsoConfirm('Войти за '+terms().entryCost+' монет и сразу нажать кнопку?')) return;
      pending ||= {roundId:state.round.id,requestId:crypto.randomUUID()};
      await refresh(true);
    } finally { busy = false; clock(); }
  });
  void refresh();
  setInterval(clock,1000);
  setInterval(() => { if (!document.hidden && !busy) void refresh(); },5000);
})();`;
