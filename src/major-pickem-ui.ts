import { majorMedals } from './major-medals.js';

export const majorPickemPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Major Pick’em · Dropso</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:radial-gradient(ellipse at 69% 0,#321a4c,#110d19 66%);color:#f8efff;font:16px/1.5 system-ui}
main{width:min(1080px,100%);margin:auto;padding:24px clamp(12px,3vw,28px) 56px}a{color:#e7c4ff}
nav{display:flex;gap:18px;flex-wrap:wrap}.heading{margin:28px 0 16px}h1{font-size:clamp(38px,7vw,70px);letter-spacing:-.055em;line-height:1.05;margin:0 0 8px}h2{font-size:21px;margin:0 0 10px}.muted{color:#cfbdde}
.panel,.slot{background:#211630;border:1px solid #654684;border-radius:15px;padding:14px;margin:12px 0}
.tracker,.tabs,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tracker>span{background:#2d1c41;border:1px solid #725294;border-radius:9px;padding:7px 12px}
.tracker-item{display:inline-flex;align-items:center;gap:8px}#tokenIcon{width:26px;height:26px;object-fit:contain}#medal img{width:36px;height:42px;object-fit:contain}
button,select{font:inherit;color:#fbf0ff;min-height:42px;border:1px solid #9567c5;background:#33204d;border-radius:9px;padding:7px 12px}
button{cursor:pointer;font-weight:700}button:disabled{cursor:default;opacity:.65}button[aria-pressed=true],.primary{background:#793cba}
button:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid white;outline-offset:3px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.slot{margin:0;border-color:#5b826f;background:#1c342e}.slot.out{border-color:#915869;background:#372031}
.slot h3{margin:0 0 7px}.selection{display:grid;grid-template-columns:31px minmax(0,1fr);align-items:center;gap:7px;margin-top:7px}
.selection select{width:100%;min-width:0;padding-inline:6px}.logo{width:28px;height:28px;object-fit:contain}
.matches{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px 14px}.matches li{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:5px;padding:8px 0;border-bottom:1px solid #624775}.matches li>span:nth-child(3){justify-content:flex-end;text-align:right}.team{display:flex;align-items:center;gap:5px;overflow-wrap:anywhere}.team img{flex:0 0 24px;width:24px;height:24px;object-fit:contain}.at{font-size:12px;color:#d6b6ec}
#notice{min-height:1.5em;margin:6px 0;color:#ead4ff}
@media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.matches{grid-template-columns:1fr}.panel,.slot{padding:10px}}
@media(max-width:390px){.selection{grid-template-columns:22px minmax(0,1fr);gap:4px}.selection .logo{width:20px;height:20px}.selection select{font-size:13px}}
</style></head><body><main>
<nav><a href="/predict">← Предикты</a><a href="/account">Главная</a></nav>
<header class="heading"><h1>Major Pick’em</h1><p class="muted">PGL Major Singapore 2026 · три стадии швейцарки и плей-офф</p></header>
<div class="tracker"><span class="tracker-item"><img id="tokenIcon" src="/predict/major-token.webp" width="26" height="26" alt=""><span id="tokens">Жетоны Major Dropso: —</span></span><span id="medal" class="tracker-item"><img alt="" hidden><span id="medalName">Медаль: —</span></span></div>
<section class="panel" aria-label="Участие"><div class="actions"><button class="primary" type="button" id="enter" disabled>Войти за 250 монет</button><span id="entryStatus" class="muted"></span></div><p id="notice" role="status"></p></section>
<div class="tabs" id="tabs" aria-label="Стадии турнира"></div>
<section class="panel"><h2 id="stageTitle">Stage 1</h2><p class="muted" id="stageInfo">Загружаем сетку…</p>
<div id="grid" class="grid"></div><div class="actions" style="margin-top:14px"><button class="primary" id="save" type="button" hidden>Сохранить прогноз</button><span id="saved" class="muted"></span></div></section>
<section class="panel" id="pairsPanel" hidden><h2>Первый раунд</h2><ul class="matches" id="matches"></ul></section>
<section class="panel"><h2>Как засчитывается прогноз</h2>
<p>В швейцарке жетон даётся за точный счёт по сериям. Для медали 3:1 и 3:2 взаимозаменяемы, как и 1:3 и 2:3. Счёт 3:0 и 0:3 должен совпасть точно.</p>
<p>Бронза появляется в профиле сразу после покупки пропуска. Шесть верных прогнозов за стадию швейцарки повышают медаль на одну ступень. В плей-офф для следующей ступени нужны минимум два верных четвертьфинала, один полуфинал и верный победитель финала.</p>
<p>Бронза → Серебро → Золото → Бриллиант → Бриллиант внутри.</p>
</section>
</main><script defer src="/predict/major-pickem.js"></script></body></html>`;

export const majorPickemScript = String.raw`(() => {
  const el = id => document.getElementById(id);
  const limits = [['3:0',2],['3:1',3],['3:2',3],['1:3',3],['2:3',3],['0:3',2]];
  const medals = ${JSON.stringify(majorMedals)};
  const errors = {
    entry_closed:'Сейчас вход закрыт. Следи за открытием следующей стадии.',
    entry_required:'Сначала оплати вход.',
    stage_locked:'Прогнозы для этой стадии закрыты.',
    invalid_picks:'Заполни все 16 мест. Каждую команду можно выбрать один раз.',
    insufficient_coins:'Для входа нужно 250 монет.',
    user_unavailable:'Для твоего аккаунта участие недоступно.'
  };
  const drafts = new Map();
  let state, stageId = 1, busy = false, offset = 0;
  const fmt = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
  const time = new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});

  function stage() {return state?.stages.find(stage => stage.id===stageId);}
  function open(item) {return item?.status==='open' && Date.parse(item.lockAt)>Date.now()+offset;}
  function editable(item) {return open(item) && state.eligible && state.entered && item.id!==4;}
  function text(tag,value) {const node=document.createElement(tag);node.textContent=value;return node;}
  function logo(team) {
    const image=document.createElement('img');image.className='logo';image.alt='';
    image.referrerPolicy='no-referrer';image.decoding='async';setLogo(image,team);return image;
  }
  function setLogo(image,team) {
    image.hidden=!team?.logo;
    if (team?.logo && image.getAttribute('src')!==team.logo) image.src=team.logo;
    if (!team?.logo) image.removeAttribute('src');
  }
  function values(item) {
    if (!drafts.has(item.id)) {
      drafts.set(item.id,new Map(limits.map(([score,count]) => {
        const teams=Object.entries(item.picks || {}).filter(([,value])=>value===score).map(([team])=>team);
        return [score,Array.from({length:count},(_,i)=>teams[i] || '')];
      })));
    }
    return drafts.get(item.id);
  }
  function refreshOptions() {
    const item=stage();
    if (!item) return;
    const selected=[...el('grid').querySelectorAll('select')].map(node=>node.value).filter(Boolean);
    for (const select of el('grid').querySelectorAll('select')) {
      select.disabled=busy || !editable(item);
      for (const option of select.options) option.disabled=Boolean(option.value && option.value!==select.value && selected.includes(option.value));
      setLogo(select.previousElementSibling,item.teams.find(team=>team.id===select.value));
    }
    el('save').disabled=busy || !editable(item) || new Set(selected).size!==16;
  }
  function render() {
    if (!state) return;
    el('tokens').textContent='Жетоны Major Dropso: '+state.tokens;
    const medal=medals[state.medal];
    const image=el('medal').querySelector('img');
    image.hidden=!medal;
    if(medal && image.getAttribute('src')!==medal.image)image.src=medal.image;
    el('medalName').textContent='Медаль: '+(medal?.name || 'Пока нет');
    const enter=el('enter');enter.hidden=state.entered;enter.disabled=busy || !state.eligible || !state.canEnter;
    el('entryStatus').textContent=state.entered ? 'Вход оплачен на весь турнир' : 'Баланс: '+state.balance+' монет';
    el('tabs').replaceChildren(...state.stages.map(item => {
      const tab=text('button',item.label);tab.type='button';
      tab.setAttribute('aria-pressed',String(item.id===stageId));
      tab.onclick=()=>{stageId=item.id;el('notice').textContent='';render();};return tab;
    }));
    const item=stage(); if (!item) return;
    el('stageTitle').textContent=item.label;
    el('stageInfo').textContent=item.lockAt
      ? (open(item) ? 'Приём до ' : 'Дедлайн: ') + fmt.format(new Date(item.lockAt)) + ' по Берлину' + (open(item) ? '' : ' · приём закрыт')
      : 'Стадия откроется после подтверждения участников и расписания.';
    el('saved').textContent=item.savedAt ? 'Последнее сохранение: '+fmt.format(new Date(item.savedAt))+' по Берлину' : '';
    el('save').hidden=!editable(item);
    const teams=new Map(item.teams.map(team=>[team.id,team]));
    el('grid').replaceChildren(...(item.teams.length===16 ? limits.map(([score,count],index)=>{
      const column=document.createElement('section');column.className='slot'+(index>=3?' out':'');
      column.append(text('h3',score+' · '+count+' места'));
      const current=values(item).get(score);
      for(let i=0;i<count;i++){
        const wrap=document.createElement('label');wrap.className='selection';
        const select=document.createElement('select');select.setAttribute('aria-label',score+', место '+(i+1));
        const blank=text('option','Выбрать команду');blank.value='';select.append(blank);
        for (const team of item.teams){const choice=text('option',team.name);choice.value=team.id;select.append(choice);}
        select.value=current[i];
        select.onchange=()=>{current[i]=select.value;refreshOptions();};
        wrap.append(logo(teams.get(current[i])),select);column.append(wrap);
      }
      return column;
    }) : []));
    el('pairsPanel').hidden=!item.pairs.length;
    el('matches').replaceChildren(...item.pairs.map(pair=>{
      const li=document.createElement('li');
      const left=text('span','');left.className='team';left.append(logo(teams.get(pair.a)),text('span',teams.get(pair.a)?.name || ''));
      const right=text('span','');right.className='team';right.append(text('span',teams.get(pair.b)?.name || ''),logo(teams.get(pair.b)));
      const scheduled=text('span',time.format(new Date(pair.at)));scheduled.className='at';li.append(left,scheduled,right);return li;
    }));
    refreshOptions();
  }
  async function load(action='',body) {
    if (busy) return;
    busy=true;
    if(action) el('notice').textContent='';
    el('enter').disabled=true;refreshOptions();
    try {
      const res=await fetch('/api/me/major-pickem'+(action?'/'+action:''),action ? {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
      } : {cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(data.error);
      state=data;offset=Date.parse(data.now)-Date.now();
      if(action==='save'){drafts.delete(body.stage);el('notice').textContent='Прогноз сохранён.';}
    } catch(error) {
      el('notice').textContent=errors[error.message] || 'Не удалось загрузить Pick’em. Попробуй обновить страницу.';
    } finally {busy=false;render();}
  }
  el('enter').onclick=async()=>{if(!busy&&await window.dropsoConfirm('Оплатить 250 монет за вход в Pick’em на весь турнир?')) void load('enter',{});};
  el('save').onclick=()=>{
    const item=stage();if(!editable(item))return;
    const selections={};
    for(const [score,teams] of values(item))for(const team of teams)if(team)selections[team]=score;
    void load('save',{stage:item.id,selections});
  };
  setInterval(()=>{const item=stage();if(item?.status==='open'&&!open(item)&&!el('save').hidden)render();},1000);
  void load();
})();`;
