export const adminStatisticsHtml=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Статистика · Dropso</title><style>
*{box-sizing:border-box}body{margin:0;background:#0c0913;color:#f6efff;font:15px/1.5 system-ui,sans-serif}main{max-width:1380px;margin:auto;padding:24px}a{color:#d8b5ff}h1{font-size:32px;margin:20px 0}h2{font-size:22px}button,input,select{font:inherit;color:inherit;border:1px solid #694487;border-radius:9px;padding:9px 12px;background:#20162c;min-height:42px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button[aria-selected=true]{background:#7534b5;border-color:#b37ce4}.tabs,.filters,.pager{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:16px 0}.filters label{display:grid;gap:5px;font-size:13px}.panel{border:1px solid #503167;border-radius:14px;background:#181021;padding:16px;margin:16px 0}.muted{color:#b9a6c9}#notice{min-height:24px}.table-wrap{overflow:auto;max-width:100%;border:1px solid #48315d;border-radius:10px}table{width:100%;border-collapse:collapse;text-align:left;font-variant-numeric:tabular-nums}th,td{padding:11px 13px;border-bottom:1px solid #3c294e;vertical-align:top;min-width:100px}th{background:#24172f;font-size:12px;color:#d4bddf}td{font-size:13px}td a{white-space:nowrap}tbody tr:last-child td{border-bottom:0}.summary{display:flex;gap:12px;flex-wrap:wrap}.summary p{padding:12px;background:#281a36;border-radius:10px;margin:4px 0}#detail{scroll-margin-top:16px}.pager{align-items:center}.pager span{color:#cdb7dc}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #d5a6ff;outline-offset:3px}[hidden]{display:none!important}@media(max-width:600px){main{padding:16px 12px}.panel{padding:12px}.filters label{flex:1;min-width:135px}.tabs button{flex:1}h1{font-size:27px}}
</style></head><body><main><a href="/admin">← Админка</a><h1>Статистика</h1>
<div class="tabs" role="tablist" aria-label="Раздел статистики"><button role="tab" id="tab-upgrades" data-kind="upgrades" aria-selected="true" aria-controls="report">Апгрейды</button><button role="tab" id="tab-black-box" data-kind="black-box" aria-selected="false" aria-controls="report">Чёрный ящик</button><button role="tab" id="tab-red-button" data-kind="red-button" aria-selected="false" aria-controls="report">Красная кнопка</button></div>
<form id="filters" class="filters"><label>С даты<input type="date" id="from"></label><label>По дату включительно<input type="date" id="to"></label><label id="sortField">Сортировка<select id="sort"><option value="value">Самые дорогие цели</option><option value="chance">Самый низкий шанс</option><option value="recent">Последние апгрейды</option></select></label><label id="resultField">Результат<select id="result"><option value="won">Успешные</option><option value="all">Все</option><option value="lost">Неудачные</option></select></label><button type="submit">Показать</button><button type="button" id="refresh">Обновить</button></form>
<p class="muted">Даты и время показаны в вашем часовом поясе. Для аукциона и кнопки фильтр выбирает раунды по дате начала.</p><p id="notice" role="status"></p>
<section id="report" role="tabpanel" aria-labelledby="tab-upgrades"><p id="count" class="muted"></p><div id="rows"></div><div class="pager"><button id="prev" type="button">← Назад</button><span id="page"></span><button id="next" type="button">Дальше →</button></div></section>
<section id="detail" class="panel" hidden><button type="button" id="closeDetail">Закрыть раунд</button><h2 id="detailTitle"></h2><p id="detailTime" class="muted"></p><div id="detailSummary" class="summary"></div><h3>Участники</h3><div id="players"></div><h3 id="historyTitle"></h3><p id="historyNote" class="muted"></p><div id="history"></div><button id="moreHistory" type="button" hidden>Показать ещё</button></section>
</main><script src="/admin/statistics.js" defer></script></body></html>`;

export const adminStatisticsJs=String.raw`(()=>{
 const $=id=>document.getElementById(id);
 let kind='upgrades',page=1,total=0,version=0,selected=null,detailVersion=0,history=[],shown=100;
 const number=x=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Number(x)||0);
 const money=x=>number(x)+' мон.';
 const when=x=>x?new Date(x).toLocaleString('ru-RU'):'—';
 function duration(ms){const seconds=Math.floor(Math.max(0,Number(ms)||0)/1000);return Math.floor(seconds/3600)+' ч '+Math.floor(seconds/60)%60+' мин '+seconds%60+' сек'}
 function text(value){const span=document.createElement('span');span.textContent=String(value??'—');return span}
 function player(p){if(!p?.login)return text(p?.name||'—');const a=document.createElement('a');a.href='/users/'+encodeURIComponent(p.login);a.textContent=p.name||p.login;return a}
 function table(id,headers,rows){
  const wrap=document.createElement('div');wrap.className='table-wrap';const grid=document.createElement('table'),head=document.createElement('thead'),line=document.createElement('tr');
  for(const title of headers){const th=document.createElement('th');th.scope='col';th.textContent=title;line.append(th)}head.append(line);grid.append(head);
  const body=document.createElement('tbody');
  for(const row of rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');td.append(value instanceof Node?value:text(value));tr.append(td)}body.append(tr)}
  grid.append(body);wrap.append(grid);$(id).replaceChildren(rows.length?wrap:text('Записей пока нет.'));
 }
 function parameters(){
  const params=new URLSearchParams({page:String(page)});
  for(const field of ['from','to'])if($(field).value){const [y,m,d]=$(field).value.split('-').map(Number);params.set(field,new Date(y,m-1,d+(field==='to'?1:0)).toISOString())}
  if(kind==='upgrades'){params.set('sort',$('sort').value);params.set('result',$('result').value)}
  return params;
 }
 async function request(params){
  const response=await fetch('/api/admin/statistics/'+kind+'?'+params,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.status===401)throw Error('Войдите на сайт под администратором.');
  if(response.status===403)throw Error('Для просмотра нужны права администратора.');
  const data=await response.json();
  if(!response.ok)throw Error(data.error==='invalid_filters'?'Проверьте даты и параметры.':'Не удалось загрузить статистику. Попробуйте обновить.');
  return data;
 }
 function pager(){const pages=Math.max(1,Math.ceil(total/25));$('page').textContent=page+' / '+pages;$('prev').disabled=page<=1;$('next').disabled=page>=pages}
 function close(){selected=null;detailVersion++;$('detail').hidden=true}
 async function load(){
  const token=++version;close();$('notice').textContent='Загружаем…';$('prev').disabled=$('next').disabled=true;
  try{
   const data=await request(parameters());if(token!==version)return;total=data.total;
   $('count').textContent='Всего по фильтру: '+number(total);
   if(kind==='upgrades'){
    table('rows',['Дата','Игрок','Исходные предметы','Стоимость предметов','Монет добавлено','Цель','Стоимость цели','Шанс','Множитель','Результат'],data.rows.map(row=>{
     const input=Number(row.source_value_coins)+Number(row.extra_coins||0);
     return [when(row.created_at),player({login:row.player?.twitch_login,name:row.player?.twitch_display_name||row.player?.twitch_login}),row.source_name,money(row.source_value_coins),money(row.extra_coins),row.target_name,money(row.target_value_coins),number(row.chance_bps/100)+'%',input>0?'×'+number(row.target_value_coins/input):'—',row.result==='won'?'Успех':'Неудача'];
    }));
   }else{
    table('rows',['Начало','Окончание','Приз','Статус','Игроки и история'],data.rows.map(row=>{
     const button=document.createElement('button');button.type='button';button.textContent='Открыть раунд';button.onclick=()=>openRound(row.id);
     return [when(row.starts_at),when(row.ends_at),row.prize_name+(row.wear?' · '+row.wear:''),row.closed_at?'Завершён':Date.parse(row.ends_at)<=Date.now()?'Ожидает подведения итогов':'Идёт',button];
    }));
   }
   pager();$('notice').textContent=total?'':'По выбранным условиям записей нет.';
  }catch(error){if(token!==version)return;$('notice').textContent=error.message;$('rows').replaceChildren();$('count').textContent='';}
 }
 function summary(values){$('detailSummary').replaceChildren(...values.map(value=>{const p=document.createElement('p');p.textContent=value;return p}))}
 function renderHistory(){
  if(kind==='black-box')table('history',['Порядок','Игрок','Ставка'],history.slice(0,shown).map((row,i)=>[i+1,player(row),money(row.amount)]));
  else table('history',['Начало удержания','Конец удержания','Игрок','Удерживал'],history.slice(0,shown).map(row=>[when(row.startedAt),row.endedAt?when(row.endedAt):'Текущее удержание',player(row),duration(row.durationMs)]));
  $('moreHistory').hidden=shown>=history.length;
 }
 async function openRound(id){
  selected=id;const token=++detailVersion;const currentKind=kind;$('detail').hidden=true;$('notice').textContent='Загружаем раунд…';
  try{
   const params=new URLSearchParams({round:id});const data=await request(params);
   if(token!==detailVersion||currentKind!==kind)return;
   const round=data.round,closed=Boolean(round.closed_at),winnerId=kind==='black-box'?round.winner_id:round.winner;
   const winner=data.players.find(p=>p.userId===winnerId);
   $('detailTitle').textContent=(kind==='black-box'?'Чёрный ящик':'Красная кнопка')+' · '+when(round.starts_at);
   $('detailTime').textContent='Данные на '+when(data.asOf)+' · окончание '+when(round.ends_at);
   const winnerText=closed?(winner?.name||'Нет победителя'):'Раунд ещё не завершён';
   const prizeText=closed&&winnerId?(kind==='red-button'&&!round.win_id?'Выдача приза не подтверждена':'Выигрыш: '+round.prize_name):'Приз раунда: '+round.prize_name;
   if(kind==='black-box'){
    summary(['Победитель: '+winnerText,prizeText,'Последняя ставка: '+(round.high_bid==null?'—':money(round.high_bid))]);
    table('players',['Игрок','Число ставок','Максимальная ставка','Итоговое списание','В резерве','Результат'],data.players.map(p=>[player(p),p.bids,money(p.highest),money(p.spent),money(p.reserved),p.won?round.prize_name:closed?'Без выигрыша':p.reserved?'Лидирует':'Ставка перебита']));
    $('historyTitle').textContent='История ставок';$('historyNote').textContent='Перебитые ставки возвращаются. Порядок показан по записи ставок в базе; время каждой ставки раньше не сохранялось.';
   }else{
    summary(['Победитель: '+winnerText,prizeText,'Стоимость приза: '+money(round.price),closed&&round.winning_ms!=null?'Победное удержание: '+duration(round.winning_ms):'Текущие результаты']);
    table('players',['Игрок','Нажатия','Суммарное удержание','Лучшее удержание','Результат'],data.players.map(p=>[player(p),p.presses,duration(p.totalMs),duration(p.bestMs),closed&&p.userId===round.winner?(round.win_id?round.prize_name:'Выдача не подтверждена'):closed?'Без выигрыша':'Раунд идёт']));
    $('historyTitle').textContent='Хронология удержаний';$('historyNote').textContent='Время текущего удержания посчитано на момент загрузки, в пределах окончания раунда. Победитель завершённого раунда взят из результата игры.';
   }
   history=data.history;shown=100;renderHistory();$('detail').hidden=false;$('notice').textContent='';$('detail').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(error){if(token===detailVersion)$('notice').textContent=error.message;}
 }
 $('moreHistory').onclick=()=>{shown+=100;renderHistory()};$('closeDetail').onclick=close;
 $('filters').onsubmit=event=>{event.preventDefault();page=1;load()};
 $('refresh').onclick=()=>selected?openRound(selected):load();
 $('prev').onclick=()=>{if(page>1){page--;load()}};$('next').onclick=()=>{if(page*25<total){page++;load()}};
 const tabs=[...document.querySelectorAll('[data-kind]')];
 for(const tab of tabs){tab.onclick=()=>{kind=tab.dataset.kind;page=1;for(const item of tabs)item.setAttribute('aria-selected',String(item===tab));$('report').setAttribute('aria-labelledby',tab.id);$('sortField').hidden=$('resultField').hidden=kind!=='upgrades';load()}}
 load();
})();`;
