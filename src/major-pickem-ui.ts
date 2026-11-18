import { swissBracketScript } from './major-pickem-swiss.js';
import { majorMedals } from './major-medals.js';
import { majorPickemShop, majorPickemShopCss, majorBronzeCaseSection, majorBronzeCaseCss } from './major-pickem-shop.js';

export const majorPickemPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Major Pick’em · Dropso</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:radial-gradient(ellipse at 69% 0,#321a4c,#110d19 66%);color:#f8efff;font:16px/1.5 system-ui}
main{width:min(1330px,100%);margin:auto;padding:24px clamp(12px,3vw,28px) 56px}a{color:#e7c4ff}
nav{display:flex;gap:18px;flex-wrap:wrap}.heading{margin:28px 0 16px}h1{font-size:clamp(38px,7vw,70px);letter-spacing:-.055em;line-height:1.05;margin:0 0 8px}h2{font-size:21px;margin:0 0 10px}.muted{color:#cfbdde}
.panel{background:#211630;border:1px solid #654684;border-radius:15px;padding:14px;margin:12px 0}
.tracker,.tabs,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tracker>span{background:#2d1c41;border:1px solid #725294;border-radius:9px;padding:7px 12px}
.tracker{align-items:stretch}.tracker-item{display:inline-flex;align-items:center;gap:8px;min-height:58px}.tracker-item img{width:42px;height:42px;object-fit:contain;flex:none}
button{font:inherit;color:#fbf0ff;min-height:42px;border:1px solid #9567c5;background:#33204d;border-radius:9px;padding:7px 12px}
button{cursor:pointer;font-weight:700}button:disabled{cursor:default;opacity:.65}button[aria-pressed=true],.primary{background:#793cba}
button:focus-visible,a:focus-visible{outline:2px solid white;outline-offset:3px}
#notice:not(:empty){margin:12px 0 0;color:#ead4ff}#notice:empty{margin:0}
.tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border:1px solid #78589c;border-radius:12px;overflow:hidden;background:#281c38}
.tabs button{border:0;border-radius:0;padding-inline:4px;background:transparent}.tabs button+button{border-left:1px solid #78589c}
.tabs button[aria-pressed=true]{background:#65329d}.tabs button:focus-visible{outline-offset:-4px}
.bracket-panel{background:linear-gradient(150deg,#241a32,#1a1426);padding:clamp(12px,2vw,22px)}
.bracket-head{display:flex;justify-content:space-between;gap:14px;align-items:baseline;flex-wrap:wrap}
.bracket-head p{margin:0}.bracket-hint{font-size:14px;margin:6px 0 16px}
.round-nav{display:none;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.round-nav button{min-width:42px}
.bracket-scroll{overflow:auto;overscroll-behavior-inline:contain;scroll-snap-type:x proximity;scroll-padding-inline:4px;padding:4px 4px 16px}
.bracket{display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));gap:16px;min-width:914px}
.round{min-width:0;display:flex;flex-direction:column;scroll-snap-align:start}
.round h3{font-size:16px;text-align:center;margin:0 0 12px;color:#f0dcff}
.round-flow{display:flex;flex:1;flex-direction:column;justify-content:center;gap:15px}
.group{display:grid;gap:5px}.group h4{margin:0;color:#dcc5ef;font-size:14px;font-variant-numeric:tabular-nums}
.match{display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);align-items:stretch;padding:3px;background:#322640;border:1px solid #614975;border-radius:9px}
.match>small{align-self:center;text-align:center;font-size:11px;color:#ddc9ee;font-variant-numeric:tabular-nums}
.match .team{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;min-width:0;min-height:65px;padding:4px 2px;background:#433151;border:1px solid transparent;border-radius:6px;font-size:12px;line-height:1.15;text-align:center;overflow-wrap:anywhere}
.match .team[aria-pressed=true]{background:#194835;border-color:#7ad3a9;color:#e0ffef}.match .team.lost{color:#dccbe5;background:#372a44}.match .team.lost .logo{opacity:.6}
.match .team:hover:not(:disabled){border-color:#c49afa}.match .team:disabled{opacity:1}.match .placeholder{color:#bdaacb;background:#352740}
.logo{width:30px;height:30px;object-fit:contain}.match .logo[hidden]{display:block!important;visibility:hidden}
.result-group{display:grid;gap:5px}.result-card{min-width:0;min-height:76px;border:1px solid #519474;background:#1c432f;border-radius:8px;padding:6px;font-size:11px;text-align:center}
.result-card.out{border-color:#ac6073;background:#542739}.result-card h4{font-size:15px;font-variant-numeric:tabular-nums;margin:0 0 4px}
.result-roster{display:flex;justify-content:center;gap:3px}.result-team{flex:0 1 33%;min-width:0;display:flex;gap:3px;flex-direction:column;align-items:center;overflow-wrap:anywhere;font-weight:600;line-height:1.15}
.result-team img{width:26px;height:26px}.result-empty{align-self:center;color:#e0cce9}
#pickemConfirm{background:#231731;color:#f7efff;border:1px solid #976ac0;border-radius:16px;padding:18px;width:min(420px,calc(100% - 28px));max-height:calc(100% - 32px)}
#pickemConfirm::backdrop{background:#0d0717b8}#pickemConfirm .actions{justify-content:flex-end}
@media(max-width:1020px){.round-nav{display:flex}}
@media(max-width:600px){.bracket{grid-template-columns:repeat(5,clamp(185px,65vw,270px));min-width:max-content;gap:12px}.round-flow{justify-content:flex-start}.bracket-head{gap:4px}}
${majorPickemShopCss}${majorBronzeCaseCss}</style></head><body><main>
<nav><a href="/predict">← Предикты</a><a href="/account">Главная</a><a href="#majorShop">Магазин Pick’em</a></nav>
<header class="heading"><h1>Major Pick’em</h1><p class="muted">PGL Major Singapore 2026 · три стадии швейцарки и плей-офф</p></header>
<div class="tracker"><span class="tracker-item"><img id="tokenIcon" src="/predict/major-token.webp" width="42" height="42" alt=""><span id="tokens">Жетоны Major Dropso: —</span></span><span id="medal" class="tracker-item"><img width="42" height="42" alt="" hidden><span id="medalName">Медаль: —</span></span></div>
<section class="panel" aria-label="Участие"><div class="actions"><button class="primary" type="button" id="enter" disabled>Войти за 250 монет</button><span id="entryStatus" class="muted"></span></div><p id="notice" role="status"></p><button type="button" id="retryPickem" hidden>Повторить загрузку</button></section>
<div class="tabs" id="tabs" aria-label="Стадии турнира"></div>
<section class="panel bracket-panel">
<div class="bracket-head"><h2 id="stageTitle">Stage 1</h2><p class="muted" id="stageInfo" role="status">Загружаем сетку…</p></div>
<p class="muted bracket-hint" id="bracketHint" hidden>Выбирай победителя в каждом матче. Пары следующего раунда появятся, когда заполнится текущий.</p>
<div class="round-nav" id="roundNav" role="group" aria-label="Перейти к раунду" hidden><span class="muted">Раунды</span></div>
<div class="bracket-scroll" id="bracketScroll" tabindex="0" aria-label="Сетка матчей"><div id="grid" class="bracket"></div></div>
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
${majorBronzeCaseSection}
</main><script defer src="/predict/major-pickem.js"></script></body></html>`;

export const majorPickemScript = String.raw`(() => {
  ${swissBracketScript}
  const el=id=>document.getElementById(id);
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
  const localDateTime=new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'});
  const localTime=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'});
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

  function resultGroup(scores,displayed,participants){
    const group=node('div',undefined,'result-group');
    for(const score of scores){
      const card=node('section',undefined,'result-card'+(score.startsWith('3:')?'':' out'));
      card.dataset.result=score;
      card.append(node('h4',score));
      const roster=node('div',undefined,'result-roster');
      const teams=Object.keys(displayed).filter(id=>displayed[id]===score && participants.has(id));
      if(!teams.length)roster.append(node('span','—','result-empty'));
      for(const id of teams){
        const team=participants.get(id),tile=node('div',undefined,'result-team');
        tile.append(logo(team),node('span',team.name));
        roster.append(tile);
      }
      card.append(roster);
      group.append(card);
    }
    return group;
  }
  function showRound(round,target){
    const scroller=el('bracketScroll');
    target.focus({preventScroll:true});
    scroller.scrollLeft+=round.getBoundingClientRect().left-scroller.getBoundingClientRect().left-4;
  }

  function drawBracket(item, config){
    const grid=el('grid'),scroller=el('bracketScroll');
    const show=Boolean(config);
    for(const id of ['bracketScroll','bracketHint','roundNav','reset'])el(id).hidden=!show;
    el('save').hidden=!config || !canSave(item);
    grid.replaceChildren();
    if(!show){
      el('saved').textContent='';
      return;
    }
    const {participants,firstRound,seeds}=config;
    const stored=draft(item);
    const simulation=buildSwiss(firstRound,seeds,stored);
    const chosenMatches=simulation.rounds.flat().filter(match=>match.winner);
    const choices=Object.fromEntries(chosenMatches.map(match=>[match.id,match.winner]));
    if(chosenMatches.length!==Object.keys(stored).length)updateDraft(item,choices);
    const complete=Object.keys(simulation.terminal).length===16;
    const saved=item.picks || {};
    const same=complete && Object.keys(simulation.terminal).every(id=>saved[id]===simulation.terminal[id]);
    const includeSaved=Object.keys(saved).length>0;
    const fresh=chosenMatches.length>0;
    el('save').disabled=busy || !complete;
    el('reset').disabled=busy || !fresh;
    el('saved').textContent=same ? 'Прогноз сохранён' : includeSaved && !fresh
      ? 'В сетке показаны сохранённые итоги. Можно собрать новый прогноз.'
      : includeSaved ? 'В сетке новый вариант. Прежний прогноз действует до сохранения.'
      : canSave(item) ? 'Выбрано матчей: '+chosenMatches.length+' из 33'
      : open(item) && state.eligible && !state.entered ? 'Для сохранения нужен пропуск.' : '';
    const displayed=fresh ? simulation.terminal : saved;

    for(const [roundIndex,groups] of swissRounds.entries()){
      const round=node('section',undefined,'round');
      round.dataset.round=roundIndex;
      const heading=node('h3','Раунд '+(roundIndex+1));
      heading.tabIndex=-1;
      const flow=node('div',undefined,'round-flow');
      if(roundIndex===3)flow.append(resultGroup(['3:0'],displayed,participants));
      if(roundIndex===4)flow.append(resultGroup(['3:1','3:2'],displayed,participants));
      const matches=simulation.rounds[roundIndex];
      for(const [score,slots] of groups){
        const group=node('div',undefined,'group');
        group.append(node('h4',score));
        const groupMatches=matches?.filter(match=>match.score===score);
        for(let i=0;i<slots;i++){
          const match=groupMatches?.[i];
          const row=node('div',undefined,'match');
          const startsAt=match?.at ? new Date(match.at) : null;
          const middle=node('small',startsAt ? localTime.format(startsAt) : 'VS');
          if(startsAt)middle.title=localDateTime.format(startsAt);
          for(const side of ['a','b']){
            if(side==='b')row.append(middle);
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
              if(scroller.scrollWidth>scroller.clientWidth && !matches.some(other=>other.id!==match.id&&!other.winner)){
                const nextRound=grid.querySelector('[data-round="'+(roundIndex+1)+'"]');
                const nextButton=nextRound?.querySelector('button');
                if(nextButton){
                  showRound(nextRound,nextButton);
                  return;
                }
              }
              buttonAfter?.focus({preventScroll:true});
            };
            row.append(button);
          }
          group.append(row);
        }
        flow.append(group);
      }
      if(roundIndex===3)flow.append(resultGroup(['0:3'],displayed,participants));
      if(roundIndex===4)flow.append(resultGroup(['1:3','2:3'],displayed,participants));
      round.append(heading,flow);
      grid.append(round);
    }
  }

  for(const roundIndex of swissRounds.keys()){
    const jump=node('button',String(roundIndex+1));
    jump.type='button';
    jump.setAttribute('aria-label','Перейти к раунду '+(roundIndex+1));
    jump.onclick=()=>{
      const round=el('grid').querySelector('[data-round="'+roundIndex+'"]');
      if(round)showRound(round,round.querySelector('h3'));
    };
    el('roundNav').append(jump);
  }

  function render(){
    if(!state)return;
    el('tokens').textContent='Жетоны Major Dropso: '+state.tokens;
    el('openBronzeCase').disabled=busy || caseBusy || shopBusy || !state.entered || state.tokens<1;
    document.querySelectorAll('.major-shop-buy').forEach(button=>{
      const cost=[1,2,3,4,5,10,15,25,40][Number(button.dataset.itemIndex)];
      button.disabled=busy || caseBusy || shopBusy || !state.entered || state.tokens<cost;
    });
    const medal=medals[state.medal],image=el('medal').querySelector('img');
    image.hidden=!medal;
    if(medal && image.getAttribute('src')!==medal.image)image.src=medal.image;
    el('medalName').textContent='Медаль: '+(medal?.name || 'Пока нет');
    const enter=el('enter');enter.hidden=state.entered;enter.disabled=busy || !state.eligible || !state.canEnter;
    el('entryStatus').textContent=state.entered ? 'Пропуск на весь турнир активирован'
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
      localDateTime.format(new Date(item.lockAt))+' · местное время'+(open(item)?'':' · приём закрыт')
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
  let caseBusy=false,shopBusy=false;
  document.querySelectorAll('.major-shop-buy').forEach(button=>button.addEventListener('click',async()=>{
    const itemIndex=Number(button.dataset.itemIndex),cost=[1,2,3,4,5,10,15,25,40][itemIndex];
    if(shopBusy||caseBusy||busy||!state?.entered||state.tokens<cost)return;
    shopBusy=true;render();el('majorShopStatus').textContent='Покупаем предмет…';
    try{
      const response=await fetch('/api/me/major-pickem/shop/buy',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId:crypto.randomUUID(),itemIndex})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.error||'shop_unavailable');
      state.tokens=result.tokens;
      el('majorShopStatus').textContent='Куплено: '+result.name+'. Предмет добавлен в инвентарь.';
    }catch(error){
      el('majorShopStatus').textContent=({insufficient_tokens:'Недостаточно жетонов.',shop_item_unavailable:'Товар временно недоступен.'})[error.message]||'Не удалось подтвердить покупку. Если жетоны списались, обратись в поддержку.';
    }finally{shopBusy=false;render();}
  }));
  const caseNames=[
    'AK-47 | Оливковый поликамуфляж','Five-SeveN | Небесная голубизна',
    'P250 | Ледяная корка','SG 553 | Корзинные полутона',
    'SCAR-20 | Песчаная сетка','M249 | Ледяная корка',
    'Негев | Кислый виноград','XM1014 | Ирэдзуми',
    'ПП-19 «Бизон» | Карамельное яблоко','MAC-10 | Световой короб',
    'Five-SeveN | Капилляры','CZ75-Auto | Эко'
  ];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function spinBronze(result){
    const roulette=el('bronzeRoulette'),strip=el('bronzeStrip');
    roulette.hidden=false;
    strip.style.transition='none';strip.style.transform='translateX(0)';
    const winner=caseNames.findIndex(name=>name===result.name);
    if(winner<0)throw Error('case_unavailable');
    const total=56,winningSlot=49;
    strip.replaceChildren();
    for(let i=0;i<total;i++){
      const slot=document.createElement('div');
      slot.className='bronze-slot';
      slot.textContent=caseNames[i===winningSlot?winner:Math.floor(Math.random()*caseNames.length)];
      strip.append(slot);
    }
    await sleep(60);
    const slotWidth=148;
    const target=winningSlot*slotWidth+70-roulette.clientWidth/2;
    const jitter=Math.floor(Math.random()*32)-16;
    strip.style.transition='transform 5800ms cubic-bezier(.09,.65,.12,1)';
    strip.style.transform='translateX('+(-target+jitter)+'px)';
    await sleep(5900);
  }
  el('openBronzeCase').onclick=async()=>{
    if(caseBusy||shopBusy||busy||!state?.entered||state.tokens<1)return;
    caseBusy=true;el('openBronzeCase').disabled=true;
    el('bronzeCaseStatus').textContent='Открываем кейс…';
    const requestId=crypto.randomUUID();
    try{
      const response=await fetch('/api/me/major-pickem/cases/bronze/open',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.error||'case_unavailable');
      await spinBronze(result);
      el('bronzeCaseStatus').textContent='Выпало: '+result.name+(result.wear?' ('+result.wear+')':'')+'. Предмет добавлен в инвентарь.';
      state.tokens=result.tokens;
      el('tokens').textContent='Жетоны Major Dropso: '+state.tokens;
    }catch(error){
      el('bronzeCaseStatus').textContent=({
        insufficient_tokens:'Недостаточно жетонов.',
        entry_required:'Для открытия нужен пропуск Major Pick’em.',
        case_prize_unavailable:'Открытие временно недоступно: проверь наличие скинов.',
        case_catalog_incomplete:'Открытие временно недоступно: каталог призов ещё не заполнен.',
      })[error.message]||'Не удалось открыть кейс. Если жетон списан, не повторяй запрос — обратись в поддержку.';
    }finally{caseBusy=false;render();}
  };
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
