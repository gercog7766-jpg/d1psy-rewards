import { swissBracketScript } from './major-pickem-swiss.js';
import { majorMedals } from './major-medals.js';
import { majorPickemShop, majorPickemShopCss } from './major-pickem-shop.js';

export const majorPickemPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Major Pick’em · Dropso</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:radial-gradient(ellipse at 69% 0,#321a4c,#110d19 66%);color:#f8efff;font:16px/1.5 system-ui}
main{width:min(1080px,100%);margin:auto;padding:24px clamp(12px,3vw,28px) 56px}a{color:#e7c4ff}
nav{display:flex;gap:18px;flex-wrap:wrap}.heading{margin:28px 0 16px}h1{font-size:clamp(38px,7vw,70px);letter-spacing:-.055em;line-height:1.05;margin:0 0 8px}h2{font-size:21px;margin:0 0 10px}.muted{color:#cfbdde}
.panel{background:#211630;border:1px solid #654684;border-radius:15px;padding:14px;margin:12px 0}
.tracker,.tabs,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tracker>span{background:#2d1c41;border:1px solid #725294;border-radius:9px;padding:7px 12px}
.tracker-item{display:inline-flex;align-items:center;gap:8px}#tokenIcon{width:26px;height:26px;object-fit:contain}#medal img{width:36px;height:42px;object-fit:contain}
button{font:inherit;color:#fbf0ff;min-height:42px;border:1px solid #9567c5;background:#33204d;border-radius:9px;padding:7px 12px}
button{cursor:pointer;font-weight:700}button:disabled{cursor:default;opacity:.65}button[aria-pressed=true],.primary{background:#793cba}
button:focus-visible,a:focus-visible{outline:2px solid white;outline-offset:3px}
#notice:not(:empty){margin:12px 0 0;color:#ead4ff}#notice:empty{margin:0}
.bracket-panel{background:linear-gradient(150deg,#241632,#161021);padding:clamp(12px,2vw,22px)}
.bracket-head{display:flex;justify-content:space-between;gap:14px;align-items:baseline;flex-wrap:wrap}
.bracket-head p{margin:0}.bracket-hint{font-size:14px;margin:6px 0 16px}
.bracket-scroll{overflow:auto;overscroll-behavior-inline:contain;scroll-padding-inline:6px;padding:4px 2px 14px}
.bracket{display:grid;grid-template-columns:repeat(5,minmax(152px,1fr));gap:16px;min-width:830px}
.round{min-width:0;position:relative}.round:not(:last-child)::after{content:"";position:absolute;inset:43px -9px 0 auto;border-right:1px dashed #8965b365;pointer-events:none}
.round h3{margin:0 0 8px;font-size:15px;color:#e4cefa}.round h4{margin:0 0 4px;color:#c7abd9;font-size:13px}.group+.group{margin-top:14px}
.match{display:grid;grid-template-columns:1fr auto 1fr;gap:3px;align-items:center;padding:3px;background:#2a1e3a;border:1px solid #58416b;border-radius:10px;margin:4px 0}
.match>small{font-size:10px;color:#c9afd9}.match .team{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;min-width:0;min-height:52px;padding:3px 1px;background:#362449;border:1px solid transparent;border-radius:7px;font-size:10px;line-height:1.1;text-align:center;overflow-wrap:anywhere}
.match .team[aria-pressed=true]{background:#204b3c;border-color:#7ad3a9;color:#e0ffef}.match .team[aria-pressed=false].lost{opacity:.55}
.match .team:hover:not(:disabled){border-color:#c49afa}.match .team:disabled{opacity:1}.match .placeholder{opacity:.55}
.logo{width:24px;height:24px;object-fit:contain}.match .logo[hidden]{display:block!important;visibility:hidden}
.result-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:12px 0}
.result-card{min-width:0;border:1px solid #468269;background:#183931;border-radius:10px;padding:8px;font-size:12px}
.result-card.out{border-color:#a15269;background:#411f35}.result-card h3{font-size:15px;margin:0 0 4px}
.result-team{display:flex;gap:5px;align-items:center;overflow-wrap:anywhere;margin:4px 0}.result-team img{flex:none;width:20px;height:20px}
#pickemConfirm{background:#231731;color:#f7efff;border:1px solid #976ac0;border-radius:16px;padding:18px;width:min(420px,calc(100% - 28px));max-height:calc(100% - 32px)}
#pickemConfirm::backdrop{background:#0d0717b8}#pickemConfirm .actions{justify-content:flex-end}
@media(max-width:820px){.bracket-scroll{scroll-snap-type:x proximity}.round{scroll-snap-align:start}.result-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:460px){.bracket{grid-template-columns:repeat(5,155px);min-width:max-content;gap:12px}.bracket-head{gap:4px}.tabs button{flex:1 1 auto}.result-card{padding:6px}}
${majorPickemShopCss}</style></head><body><main>
<nav><a href="/predict">← Предикты</a><a href="/account">Главная</a><a href="#majorShop">Магазин Pick’em</a></nav>
<header class="heading"><h1>Major Pick’em</h1><p class="muted">PGL Major Singapore 2026 · три стадии швейцарки и плей-офф</p></header>
<div class="tracker"><span class="tracker-item"><img id="tokenIcon" src="/predict/major-token.webp" width="26" height="26" alt=""><span id="tokens">Жетоны Major Dropso: —</span></span><span id="medal" class="tracker-item"><img alt="" hidden><span id="medalName">Медаль: —</span></span></div>
<section class="panel" aria-label="Участие"><div class="actions"><button class="primary" type="button" id="enter" disabled>Войти за 250 монет</button><span id="entryStatus" class="muted"></span></div><p id="notice" role="status"></p><button type="button" id="retryPickem" hidden>Повторить загрузку</button></section>
<div class="tabs" id="tabs" aria-label="Стадии турнира"></div>
<section class="panel bracket-panel">
<div class="bracket-head"><h2 id="stageTitle">Stage 1</h2><p class="muted" id="stageInfo" role="status">Загружаем сетку…</p></div>
<p class="muted bracket-hint" id="bracketHint" hidden>Выбирай победителя в каждом матче. Пары следующего раунда появятся, когда заполнится текущий.</p>
<div class="bracket-scroll" id="bracketScroll" tabindex="0" aria-label="Сетка матчей"><div id="grid" class="bracket"></div></div>
<div class="result-grid" id="results"></div>
<div class="actions"><button class="primary" id="save" type="button" hidden>Сохранить прогноз</button><button id="reset" type="button" hidden>Сбросить сетку</button><span id="saved" class="muted" role="status"></span></div></section>
<dialog id="pickemConfirm" aria-labelledby="pickemConfirmTitle">
<h2 id="pickemConfirmTitle">Купить пропуск?</h2><p>250 монет за участие во всех стадиях турнира. Бронзовая медаль появится в профиле сразу после оплаты.</p>
<div class="actions"><button id="cancelPass" type="button" autofocus>Отмена</button><button id="buyPass" class="primary" type="button">Купить за 250 монет</button></div></dialog>
<section class="panel"><h2>Как засчитывается прогноз</h2>
<p>В швейцарке жетон даётся за точный счёт по сериям. Для медали 3:1 и 3:2 взаимозаменяемы, как и 1:3 и 2:3. Счёт 3:0 и 0:3 должен совпасть точно.</p>
<p>Бронза появляется в профиле сразу после покупки пропуска. Шесть верных прогнозов за стадию швейцарки повышают медаль на одну ступень. В плей-офф для следующей ступени нужны минимум два верных четвертьфинала, один полуфинал и верный победитель финала.</p>
<p>Бронза → Серебро → Золото → Бриллиант → Бриллиант внутри.</p>
</section>
${majorPickemShop}
</main><script defer src="/predict/major-pickem.js"></script></body></html>`;

export const majorPickemScript = String.raw`(() => {
  ${swissBracketScript}
  const el=id=>document.getElementById(id);
  const scores=['3:0','3:1','3:2','1:3','2:3','0:3'];
  const medals=${JSON.stringify(majorMedals)};
  const errors={
    entry_closed:'Сейчас вход закрыт. Следи за открытием следующей стадии.',
    entry_required:'Для сохранения прогноза нужен пропуск.',
    stage_locked:'Прогнозы для этой стадии закрыты.',
    invalid_picks:'Выбери победителя в каждом матче.',
    insufficient_coins:'Для входа нужно 250 монет.',
    user_unavailable:'Для твоего аккаунта участие недоступно.'
  };
  const drafts=new Map();
  const fmt=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
  const time=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
  let state,stageId=1,busy=false,offset=0;

  const activeStage=()=>state?.stages.find(item=>item.id===stageId);
  const open=item=>item?.status==='open' && Date.parse(item.lockAt)>Date.now()+offset;
  const canSave=item=>open(item) && state.eligible && state.entered && item.id!==4;
  const draftKey=item=>'major-pickem-swiss-v1:'+state.draftKey+':'+item.id;
  function draft(item) {
    if(!drafts.has(item.id)){
      let saved=null;
      if(state.draftKey)try{saved=JSON.parse(localStorage.getItem(draftKey(item)));}catch{}
      drafts.set(item.id,saved && typeof saved==='object' && !Array.isArray(saved) ? saved : {});
    }
    return drafts.get(item.id);
  }
  function updateDraft(item,choices){
    drafts.set(item.id,choices);
    if(state.draftKey)try{localStorage.setItem(draftKey(item),JSON.stringify(choices));}catch{}
  }
  function node(tag,value,cls){
    const element=document.createElement(tag);
    if(value!==undefined)element.textContent=value;
    if(cls)element.className=cls;
    return element;
  }
  function logo(team){
    const img=node('img',undefined,'logo');
    img.alt='';
    if(team?.logo){
      img.referrerPolicy='no-referrer';img.decoding='async';img.src=team.logo;
    }else img.hidden=true;
    return img;
  }
  function setup(item){
    if(!item || item.id===4 || item.teams.length!==16 || item.pairs.length!==8)return null;
    const participants=new Map(item.teams.map(team=>[team.id,team]));
    const paired=item.pairs.flatMap(({a,b})=>[a,b]);
    if(new Set(paired).size!==16 || paired.some(id=>!participants.has(id)))return null;
    const seeds=item.id===1 ? stageOneSeeds : [...item.pairs.map(match=>match.a),...item.pairs.map(match=>match.b)];
    if(seeds.length!==16 || new Set(seeds).size!==16 || seeds.some(id=>!participants.has(id)))return null;
    const order=new Map(seeds.map((id,i)=>[id,i]));
    const firstRound=[...item.pairs].sort((a,b)=>order.get(a.a)-order.get(b.a));
    return {participants,firstRound,seeds};
  }

  function drawBracket(item, config){
    const grid=el('grid'),results=el('results'),scroller=el('bracketScroll');
    const show=Boolean(config);
    for(const id of ['bracketScroll','bracketHint','results','reset'])el(id).hidden=!show;
    el('save').hidden=!config || !canSave(item);
    grid.replaceChildren();results.replaceChildren();
    if(!show){
      el('saved').textContent='';
      return;
    }
    const choices=draft(item);
    const {participants,firstRound,seeds}=config;
    const simulation=buildSwiss(firstRound,seeds,choices);
    const complete=Object.keys(simulation.terminal).length===16;
    const saved=item.picks || {};
    const same=complete && Object.keys(simulation.terminal).every(id=>saved[id]===simulation.terminal[id]);
    const includeSaved=Object.keys(saved).length>0;
    const fresh=Object.keys(choices).length>0;
    el('save').disabled=busy || !complete;
    el('reset').disabled=busy || !fresh;
    const count=simulation.rounds.flat().filter(match=>match.winner).length;
    el('saved').textContent=same ? 'Прогноз сохранён' : includeSaved && !fresh
      ? 'Ниже показаны сохранённые итоги. В сетке можно собрать новый прогноз.'
      : includeSaved ? 'В сетке новый вариант. Прежний прогноз действует до сохранения.'
      : canSave(item) ? 'Выбрано матчей: '+count+' из 33'
      : open(item) && state.eligible && !state.entered ? 'Для сохранения нужен пропуск.' : '';
    const displayed=fresh ? simulation.terminal : saved;

    for(const [roundIndex,groups] of swissRounds.entries()){
      const round=node('section',undefined,'round');
      round.dataset.round=roundIndex;
      round.append(node('h3','Раунд '+(roundIndex+1)));
      const matches=simulation.rounds[roundIndex];
      for(const [score,slots] of groups){
        const group=node('div',undefined,'group');
        group.append(node('h4',score));
        const groupMatches=matches?.filter(match=>match.score===score);
        for(let i=0;i<slots;i++){
          const match=groupMatches?.[i];
          const row=node('div',undefined,'match');
          const middle=match?.at ? time.format(new Date(match.at)) : 'VS';
          for(const side of ['a','b']){
            if(side==='b')row.append(node('small',middle));
            const team=participants.get(match?.[side]);
            if(!team){row.append(node('span','—','team placeholder'));continue;}
            const button=node('button',undefined,'team');
            button.type='button';button.disabled=busy;
            button.dataset.match=match.id;button.dataset.team=team.id;
            button.setAttribute('aria-label','Победитель: '+team.name+' · раунд '+(roundIndex+1));
            button.setAttribute('aria-pressed',String(match.winner===team.id));
            if(match.winner && match.winner!==team.id)button.classList.add('lost');
            button.append(logo(team),node('span',team.name));
            button.onclick=()=>{
              if(busy || match.winner===team.id)return;
              const next=Object.fromEntries(Object.entries(choices).filter(([key])=>Number(key.split('/')[0])<=roundIndex));
              next[match.id]=team.id;
              updateDraft(item,next);
              drawBracket(item,config);
              const buttonAfter=[...grid.querySelectorAll('button')].find(node=>node.dataset.match===match.id && node.dataset.team===team.id);
              if(window.matchMedia?.('(max-width: 820px)').matches && !matches.some(other=>other.id!==match.id&&!other.winner)){
                const nextRound=grid.querySelector('[data-round="'+(roundIndex+1)+'"]');
                const nextButton=nextRound?.querySelector('button');
                if(nextButton){
                  nextButton.focus({preventScroll:true});
                  scroller.scrollLeft+=nextRound.getBoundingClientRect().left-scroller.getBoundingClientRect().left;
                  return;
                }
              }
              buttonAfter?.focus({preventScroll:true});
            };
            row.append(button);
          }
          group.append(row);
        }
        round.append(group);
      }
      grid.append(round);
    }

    for(const score of scores){
      const card=node('section',undefined,'result-card'+(score.startsWith('3:')?'':' out'));
      card.append(node('h3',score));
      const teams=Object.keys(displayed).filter(id=>displayed[id]===score && participants.has(id));
      if(!teams.length)card.append(node('span','—'));
      for(const id of teams){
        const team=participants.get(id),line=node('div',undefined,'result-team');
        line.append(logo(team),node('span',team.name));
        card.append(line);
      }
      results.append(card);
    }
  }

  function render(){
    if(!state)return;
    el('tokens').textContent='Жетоны Major Dropso: '+state.tokens;
    const medal=medals[state.medal],image=el('medal').querySelector('img');
    image.hidden=!medal;
    if(medal && image.getAttribute('src')!==medal.image)image.src=medal.image;
    el('medalName').textContent='Медаль: '+(medal?.name || 'Пока нет');
    const enter=el('enter');enter.hidden=state.entered;enter.disabled=busy || !state.eligible || !state.canEnter;
    el('entryStatus').textContent=state.entered ? 'Пропуск на весь турнир куплен'
      : !state.eligible ? 'Для твоего аккаунта участие недоступно'
      : !state.canEnter ? 'Покупка пропуска сейчас закрыта'
      : 'Баланс: '+state.balance+' монет';
    el('tabs').replaceChildren(...state.stages.map(item=>{
      const tab=node('button',item.label);tab.type='button';
      tab.setAttribute('aria-pressed',String(item.id===stageId));
      tab.onclick=()=>{
        stageId=item.id;el('notice').textContent='';
        el('bracketScroll').scrollLeft=0;
        render();
        el('tabs').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
      };
      return tab;
    }));
    const item=activeStage();if(!item)return;
    el('stageTitle').textContent=item.label;
    el('stageInfo').textContent=item.lockAt ? (open(item) ? 'Приём до ' : 'Дедлайн: ') +
      fmt.format(new Date(item.lockAt))+' по Берлину'+(open(item)?'':' · приём закрыт')
      : 'Сетка появится после подтверждения участников и расписания.';
    drawBracket(item,setup(item));
  }

  async function load(action='',body){
    if(busy)return;
    busy=true;
    el('notice').textContent='';
    render();
    try{
      const res=await fetch('/api/me/major-pickem'+(action?'/'+action:''),action ? {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
      } : {cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(data.error);
      state=data;offset=Date.parse(data.now)-Date.now();
      if(action==='enter')el('notice').textContent='Пропуск куплен. Бронзовая медаль добавлена в профиль.';
    }catch(error){
      el('notice').textContent=errors[error.message] || 'Не удалось выполнить действие. Попробуй ещё раз.';
      if(!state)el('retryPickem').hidden=false;
    }finally{busy=false;render();}
  }
  const dialog=el('pickemConfirm');
  function closePass(){
    if(typeof dialog.close==='function')dialog.close();
    else dialog.removeAttribute('open');
    el('enter').focus();
  }
  el('enter').onclick=()=>{
    if(busy || dialog.open)return;
    if(typeof dialog.showModal==='function')dialog.showModal();
    else{dialog.setAttribute('open','');el('cancelPass').focus();}
  };
  el('cancelPass').onclick=closePass;
  el('buyPass').onclick=()=>{closePass();void load('enter',{});};
  el('retryPickem').onclick=()=>{el('retryPickem').hidden=true;void load();};
  el('save').onclick=()=>{
    const item=activeStage(),config=setup(item);
    if(!config || !canSave(item))return;
    const {terminal}=buildSwiss(config.firstRound,config.seeds,draft(item));
    if(Object.keys(terminal).length===16)void load('save',{stage:item.id,selections:terminal});
  };
  el('reset').onclick=()=>{
    const item=activeStage();
    if(!item)return;
    updateDraft(item,{});
    el('bracketScroll').scrollLeft=0;
    drawBracket(item,setup(item));
    el('grid').querySelector('button')?.focus({preventScroll:true});
  };
  setInterval(()=>{
    if(!open(activeStage()) && !el('save').hidden)render();
  },1000);
  void load();
})();`;
