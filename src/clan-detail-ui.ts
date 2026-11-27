export const clanDetailStyle=String.raw`
.clan-detail-hero[data-plus-theme=aurora]{background:radial-gradient(ellipse at 80% 0,#44cfc465,transparent 65%),linear-gradient(135deg,#291d55,#122d36)!important;border-color:#9bf7df!important}
.clan-detail-hero[data-plus-theme=royal]{background:radial-gradient(ellipse at 85% 0,#e5a84266,transparent 65%),linear-gradient(135deg,#40285a,#271b2f)!important;border-color:#ffd692!important}
.clan-detail-hero[data-plus-theme=nebula]{background:radial-gradient(ellipse at 85% 0,#a85fff77,transparent 65%),linear-gradient(135deg,#352365,#181f43)!important;border-color:#d7a6ff!important}
.clan-detail-hero[data-plus-theme] .avatar{border:3px double #d3f8ff!important;box-shadow:0 0 18px #ba83ff99!important}
.clan-plus-mark{display:inline-block;border:1px solid #d3b4ff;border-radius:7px;background:#43276a;color:#f3d7ff;font-size:11px;font-weight:800;padding:3px 8px;margin-left:8px}
.syndicate-main.clan-detail-mode>.hero{display:none}
.clan-detail-toolbar{display:flex;gap:10px;align-items:center;margin:0 0 15px;flex-wrap:wrap}
.clan-detail-toolbar button{background:#241633;border-color:#75419b;border-radius:10px}
.syndicate-main .clan-detail-hero{position:relative;isolation:isolate;overflow:hidden;margin:0 0 18px;padding:26px 32px;background:radial-gradient(ellipse at 88% 20%,#6927a35c,transparent 60%),linear-gradient(122deg,#211431,#130d21);border:1px solid #b759f0;box-shadow:inset 1px 1px 0 #e6a1ffa0,inset -1px -1px 0 #ad44ed80,0 0 24px #a337f22b}
.clan-detail-hero:after{content:'';position:absolute;z-index:-1;width:30%;height:130%;right:2%;top:2%;background:linear-gradient(130deg,#54248d,#bb42ff);mask:url('/pwa/icon/brand-logo.png') center/contain no-repeat;opacity:.15;pointer-events:none}
.clan-detail-hero .clan-heading{display:flex;align-items:center;gap:18px;min-width:0}
.clan-detail-hero .avatar{width:88px;height:88px;border-radius:18px;flex:none;background:#352046;border:2px solid #a169d5;object-fit:cover}
.syndicate-main .clan-detail-hero h2{margin:0 0 8px;font-size:clamp(25px,4vw,42px);font-weight:900;letter-spacing:-.02em;overflow-wrap:anywhere}
.clan-level-pill{display:inline-flex;border:1px solid #a85ee1;border-radius:999px;background:#4c286e75;font-size:13px;font-weight:800;padding:4px 12px;color:#e3b2ff}
.clan-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.clan-detail-tags span{background:#281c35;border-radius:8px;padding:4px 8px;font-size:12px}
.clan-tab-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px;margin:15px 0}
.clan-tab-nav button{min-width:0;white-space:normal;padding:10px 6px;min-height:47px;border:1px solid #674183;background:#21152e;border-radius:12px;display:flex;justify-content:center;align-items:center;gap:6px;font-size:13px;color:#d9c3ed;font-weight:750}
.clan-tab-nav button[aria-selected=true]{color:white;border-color:#c37af7;background:linear-gradient(160deg,#8650c6,#4e217d);box-shadow:0 0 15px #a535e54a,inset 0 1px 1px #eec7ff44}
.clan-tab-nav .tab-badge{min-width:20px;border-radius:20px;padding:2px 5px;background:#281242;color:#e8c2ff;font-size:11px}
.clan-view{min-width:0}.clan-view>.panel{margin:12px 0 18px}
.clan-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:12px 0 18px}
.clan-stat{min-width:0;padding:16px 12px;border:1px solid #77439b;border-radius:15px;background:linear-gradient(145deg,#352047,#21152f)}
.clan-stat span{display:block;color:#cbb6e0;font-size:12px}.clan-stat b{display:block;color:#e0a5ff;font-size:clamp(18px,2.6vw,30px);line-height:1.3;overflow-wrap:anywhere}
.clan-overview-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.clan-overview-links button{min-height:68px;text-align:left;background:linear-gradient(130deg,#3b2052,#251630);border-color:#8250a6;font-weight:750}
.clan-overview-links button:hover{border-color:#c574fc;background:#482362}
.clan-task-card{padding:14px 16px;margin:10px 0;border:1px solid #68418a;border-radius:13px;background:#241731}
.clan-task-card.done{border-color:#41a492;background:#13362f55}.clan-task-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}
.clan-task-heading>b{font-size:15px}.clan-task-status{color:#e9b5ff;font-weight:800;white-space:nowrap;font-size:13px}
.clan-task-card.done .clan-task-status{color:#70dfbe}.clan-task-card .bar{height:9px;margin:10px 0}
.clan-task-card .muted{font-size:12px;line-height:1.4}
.clan-deposit-form{display:flex;gap:10px;align-items:center;margin:10px 0 20px;flex-wrap:wrap}
.clan-deposit-form input{flex:1;min-width:100px}.clan-deposit-form button{min-width:130px}
.clan-ledger-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #6b43854d;font-size:13px}
.clan-ledger-line b{white-space:nowrap;color:#bba0db}.clan-ledger-line.shop-spend b{color:#ffb7d1}
.clan-member-row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.clan-member-label{display:flex;align-items:center;gap:10px;min-width:0;overflow-wrap:anywhere}
.clan-member-initial{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;flex:none;background:#3b2253;color:#d49eff;font-weight:800}
.clan-chat-history{max-height:430px;min-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:8px}
.clan-chat-line{padding:10px 12px;border:1px solid #5c3979;border-radius:12px;background:#2b193e;overflow-wrap:anywhere}
.clan-chat-line b{display:block;color:#dca5ff;margin-bottom:4px;font-size:13px}
.clan-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.clan-settings-grid label{display:grid;gap:5px;color:#c7b1dc;font-size:13px}.clan-settings-grid input{width:100%;min-width:0}
.clan-view .levels{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.clan-view .level{background:#21152d;min-height:84px;display:flex;flex-direction:column;gap:7px}
.clan-view .level.unlocked{background:linear-gradient(145deg,#472565,#28163c)}
.clan-section-switch{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 18px}
.clan-section-switch button{flex:1;min-width:90px;white-space:nowrap;background:#241633;border-color:#69418c;color:#dcc5f3;font-size:13px;font-weight:750}
.clan-section-switch button[aria-pressed=true]{background:linear-gradient(150deg,#8244be,#57268a);border-color:#c881f9;box-shadow:0 0 12px #9028da40;color:white}
.clan-level-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;border-radius:15px;padding:16px;background:linear-gradient(130deg,#3a1d54,#20152e);border:1px solid #8d4abb;margin-bottom:14px}
.clan-level-summary b{display:block;color:#dda2ff;font-size:clamp(22px,3vw,34px)}.clan-level-summary span{color:#d3bfe7}
.clan-level-summary .clan-level-icon{font-size:40px;color:#c67cff;text-shadow:0 0 15px #a331ea}
.clan-view .level{min-height:126px;position:relative;padding:12px;border-radius:12px}.clan-view .level b{color:#edc3ff;font-size:15px}.clan-view .level small{margin-top:auto;font-size:12px;color:#bda7d7}.clan-view .level.locked{opacity:.76}.clan-view .level.current{border-color:#d88bff;box-shadow:inset 0 0 15px #b248ef35}.clan-level-status{font-size:11px;color:#dab4f7;font-weight:750}
@media(max-width:650px){.clan-section-switch{gap:6px}.clan-section-switch button{min-width:0;flex:1 1 27%;font-size:12px;padding:8px 6px}.clan-view .level{min-height:112px}.clan-level-summary{padding:12px}}
@media(max-width:650px){.syndicate-main .clan-detail-hero{padding:18px 15px}.clan-detail-hero .avatar{width:65px;height:65px;border-radius:14px}.clan-detail-hero .clan-heading{gap:12px}.clan-tab-nav{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.clan-tab-nav button{min-height:43px;font-size:12px}.clan-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.clan-stat{padding:12px}.clan-overview-links{gap:8px}.clan-overview-links button{font-size:13px;min-height:55px}.clan-task-card{padding:12px}.clan-deposit-form{gap:7px}.clan-deposit-form button{min-width:95px}.clan-settings-grid{grid-template-columns:1fr}.clan-view .levels{grid-template-columns:repeat(2,minmax(0,1fr))}.clan-chat-history{max-height:50vh}.clan-detail-toolbar button{font-size:12px}}
`;

export const clanDetailJs=String.raw`
let clanTab='overview',clanViews=null,clanLevelRange=null,clanShopCategory='frame';
function switchClanTab(key){
 if(!clanViews||!clanViews.has(key))return;
 clanTab=key;
 for(const [name,view] of clanViews){const active=name===key;view.pane.hidden=!active;view.button.setAttribute('aria-selected',String(active));view.button.tabIndex=active?0:-1}
}
function makeClanViews(d){
 const nav=el('div',undefined,'clan-tab-nav');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Разделы клана');
 const views=new Map(),activeVotes=d.shop?.proposals?.filter(v=>v.status==='pending').length||0;
 const tabs=[['overview','Обзор'],['tasks','Задания'],['members','Состав'],['treasury','Общак',activeVotes],['shop','Магазин'],['chat','Чат'],['levels','Развитие']];
 if(d.leader)tabs.push(['settings','Управление',d.requests.length]);
 for(const [key,label,count] of tabs){
  const pane=el('section',undefined,'clan-view');pane.id='clan-pane-'+key;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','clan-tab-'+key);
  const b=button(label,()=>switchClanTab(key));b.id='clan-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',pane.id);
  if(count)b.append(el('span',count,'tab-badge'));nav.append(b);views.set(key,{button:b,pane});
 }
 nav.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const keys=[...views.keys()],i=keys.indexOf(clanTab),next=e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length;e.preventDefault();switchClanTab(keys[next]);views.get(keys[next]).button.focus()});
 root.append(nav);for(const v of views.values())root.append(v.pane);
 clanViews=views;if(!views.has(clanTab))clanTab='overview';switchClanTab(clanTab);
 return key=>views.get(key).pane;
}
async function detail(id){
 if(current!==id){clanTab='overview';clanLevelRange=null;clanShopCategory='frame'}current=id;
 const d=await api('detail',{clanId:id});document.querySelector('main').classList.add('clan-detail-mode');
 const toolbar=el('div',undefined,'clan-detail-toolbar');toolbar.append(button('← Все кланы',()=>run(list)));root.replaceChildren(toolbar);
 const h=panel(d.name),heading=el('div',undefined,'clan-heading'),emblem=avatar(d.avatar),info=el('div'),title=h.querySelector('h2');
 h.classList.add('clan-detail-hero');info.append(title,el('span','LVL '+d.level,'clan-level-pill'));heading.append(emblem,info);h.append(heading);
 if(d.decorations){const c=d.decorations,tone=x=>'hsl('+((260+Number(x)*17)%360)+' 85% 66%)';if(c.frame){emblem.style.border='3px solid '+tone(c.frame);emblem.style.boxShadow='0 0 12px '+tone(c.frame)}if(c.background)h.style.background='radial-gradient(ellipse at top right,'+tone(c.background)+',#191127 75%)';if(c.tag)title.style.color=tone(c.tag);const tags=el('div',undefined,'clan-detail-tags');for(const key of ['badge','flag','banner','medal','title','effect'])if(c[key]){const tag=el('span','✦ '+rewards[c[key]-1],'muted');tag.style.color=tone(c[key]);tags.append(tag)}if(tags.children.length)h.append(tags)}
 applyShopDecorations(d.shop,h,emblem);if(['aurora','royal','nebula'].includes(d.plusAppearance?.theme)){h.dataset.plusTheme=d.plusAppearance.theme;info.append(el('span','✦ PLUS','clan-plus-mark'))}root.append(h);
 if(!d.member){h.append(el('p','Внутренние разделы доступны только участникам.'),button(d.pending?'Заявка отправлена':'Подать заявку',()=>run(async()=>{await api('apply',{clanId:id});await detail(id)})));if(d.canVisit)h.append(button('Войти для проверки',()=>run(async()=>{await api('owner_enter',{clanId:id});await detail(id)})));return}
 if(d.visitor){h.append(el('p','Режим владельца Dropso · проверка без занятия места','clan-own-rank'));toolbar.append(button('Выйти из клана (проверка)',()=>run(async()=>{await api('owner_exit',{clanId:id});await list()})))}
 const pane=makeClanViews(d),overview=panel('Обзор клана'),stats=el('div',undefined,'clan-stat-grid');
 for(const [label,value] of [['Участники',d.members.length+'/'+d.capacity],['Опыт клана',d.cxp+' CXP'],['Сезон',d.cp==null?'—':d.cp+' CP'],['Общак',d.treasury+' монет']]){const c=el('div',undefined,'clan-stat');c.append(el('span',label),el('b',value));stats.append(c)}
 overview.append(stats,el('p',d.members.length+'/'+d.capacity+' участников','muted'));
 const level=Number(d.level),xp=Number(d.cxp),next=level*250+level*(level-1)*25/2,prev=(level-1)*250+(level-1)*(level-2)*25/2;
 if(level<67){const progress=el('div',undefined,'bar'),fill=el('i');fill.style.width=Math.min(100,Math.max(0,(xp-prev)/(next-prev)*100))+'%';progress.append(fill);overview.append(el('p','До LVL '+(level+1)+': '+Math.max(0,next-xp)+' CXP','clan-own-rank'),progress)}
 if(d.streamCp!=null)overview.append(el('p','Присутствие в чатах стримов: '+d.streamCp+' CP','muted'));
 const links=el('div',undefined,'clan-overview-links'),done=d.tasks.filter(t=>t.done).length;
 for(const [key,label] of [['tasks','Задания · '+done+'/'+d.tasks.length+' выполнено'],['members','Состав · '+d.members.length+' участников'],['treasury','Общак · '+d.treasury+' монет'],['shop','Магазин оформлений'],['chat','Чат клана'],['levels','Развитие · LVL '+d.level]])links.append(button(label,()=>switchClanTab(key)));
 overview.append(links);pane('overview').append(overview);
 const treasury=panel('Общак · '+d.treasury+' монет'),amount=input('Сумма','','number'),deposit=el('div',undefined,'clan-deposit-form');
 deposit.append(amount,button('Пополнить',()=>run(async()=>{const n=Number(amount.value);if(!await window.dropsoConfirm('Внести '+n+' монет в общак?'))return;if(!pendingDeposit||pendingDeposit.clanId!==id||pendingDeposit.amount!==n)pendingDeposit={clanId:id,amount:n,requestId:crypto.randomUUID()};await api('deposit',pendingDeposit);pendingDeposit=null;await detail(id)})));
 if(d.visitor){amount.disabled=true;deposit.querySelector('button').disabled=true}treasury.append(deposit,el('h3','История операций'));
 for(const l of d.ledger){const row=el('div',undefined,'clan-ledger-line'+(l.amount<0?' shop-spend':''));row.append(el('span',l.description||l.login||'Награда уровня'),el('b',(l.amount>0?'+':'')+l.amount+' монет'));treasury.append(row)}if(!d.ledger.length)treasury.append(el('p','История пока пуста','muted'));pane('treasury').append(treasury);renderClanShop(d,id,pane('shop'),pane('treasury'));
 const tasks=panel('Задания · до '+new Date(Date.parse(d.ends+'T00:00:00Z')-86400000).toISOString().slice(0,10)+' включительно');
 for(const t of d.tasks){const item=el('div',undefined,'clan-task-card'+(t.done?' done':'')),head=el('div',undefined,'clan-task-heading'),bar=el('div',undefined,'bar'),fill=el('i');head.append(el('b',t.label),el('span',t.done?'Выполнено ✓':t.progress+'/'+t.target,'clan-task-status'));fill.style.width=Math.min(100,t.progress/t.target*100)+'%';bar.append(fill);item.append(head,bar,el('span',t.cxp+' CXP + '+t.cxp+' CP'+(t.cpRate?' · сверх цели +'+t.cpRate+' CP за действие до коэффициента состава':''),'muted'));tasks.append(item)}pane('tasks').append(tasks);
 const members=panel('Участники · '+d.members.length+'/'+d.capacity);
 for(const m of d.members){const row=el('div',undefined,'card clan-member-row'),label=el('div',undefined,'clan-member-label');label.append(el('span',String(m.login||'?').slice(0,1).toUpperCase(),'clan-member-initial'),el('strong',m.login+(m.owner?' · Лидер':'')));row.append(label);if(d.leader&&!m.owner)row.append(button('Исключить',()=>run(async()=>{if(!await window.dropsoConfirm('Исключить участника?'))return;await api('kick',{clanId:id,userId:m.id});await detail(id)})));members.append(row)}
 if(!d.leader&&!d.visitor)members.append(button('Выйти',()=>run(async()=>{if(!await window.dropsoConfirm('Покинуть клан?'))return;await api('leave',{clanId:id});await list()})));pane('members').append(members);
 if(d.leader){const p=panel('Управление кланом'),name=input('Название',d.name),file=fileInput(),lvl=input('Мин. Dropso LVL',d.minLevel,'number'),bp=input('Мин. Battle Pass LVL',d.minBp,'number'),form=el('div',undefined,'clan-settings-grid');for(const [label,field] of [['Название клана',name],['Аватар клана',file],['Минимальный Dropso LVL',lvl],['Минимальный Battle Pass LVL',bp]]){const l=el('label',label);l.append(field);form.append(l)}
 p.append(form,button('Сохранить',()=>run(async()=>{await api('settings',{clanId:id,name:name.value,minLevel:Number(lvl.value),minBp:Number(bp.value),...(file.files[0]?{avatar:await readAvatar(file.files[0])}:{})});await detail(id)})));pane('settings').append(p);if(d.plusAppearance?.canEdit){const plus=panel('Эксклюзивное оформление PLUS'),picker=el('select');for(const [value,label]of [['','Обычное оформление'],['aurora','Полярное сияние'],['royal','Королевская орбита'],['nebula','Фиолетовая туманность']]){const option=el('option',label);option.value=value;picker.append(option)}picker.value=d.plusAppearance.theme||'';plus.append(el('p','Дополнительное оформление действует, пока у лидера активна подписка PLUS.','muted'),picker,button('Применить оформление',()=>run(async()=>{const response=await fetch('/api/me/membership/clan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clanId:id,theme:picker.value||null})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Не удалось сохранить оформление');await detail(id)})));pane('settings').append(plus)}const req=panel('Заявки на вступление · '+d.requests.length);for(const r of d.requests){const row=el('div',undefined,'card');row.append(el('span',r.login),...['approve','reject'].map(a=>button(a==='approve'?'Принять':'Отклонить',()=>run(async()=>{await api(a,{clanId:id,userId:r.id});await detail(id)}))));req.append(row)}if(!d.requests.length)req.append(el('p','Нет заявок','muted'));pane('settings').append(req)}
 const chat=panel('Чат клана'),history=el('div',undefined,'clan-chat-history'),msg=input('Сообщение'),send=el('div',undefined,'clan-deposit-form');
 for(const m of d.chat){const line=el('div',undefined,'clan-chat-line');line.append(el('b',m.login),el('span',m.message));history.append(line)}if(!d.chat.length)history.append(el('p','Сообщений пока нет','muted'));send.append(msg,button('Отправить',()=>run(async()=>{await api('chat',{clanId:id,message:msg.value});await detail(id)})),button('Обновить',()=>run(()=>detail(id))));if(d.visitor){msg.disabled=true;send.querySelector('button').disabled=true}chat.append(history,send);pane('chat').append(chat);
 const levels=panel('Развитие клана'),summary=el('div',undefined,'clan-level-summary'),intro=el('div'),grid=el('div',undefined,'levels'),ranges=el('div',undefined,'clan-section-switch');
 intro.append(el('b','LVL '+d.level+' / 67'),el('span',d.cxp+' CXP · '+(level<67?'до следующего '+Math.max(0,next-xp)+' CXP':'Максимальный уровень')));summary.append(intro,el('span','✦','clan-level-icon'));levels.append(summary,el('p','Выбери диапазон уровней, чтобы посмотреть награды.','muted'),ranges,grid);
 const rangeButtons=[];
 function showRange(start){clanLevelRange=start;for(const [n,b] of rangeButtons)b.setAttribute('aria-pressed',String(n===start));grid.replaceChildren();for(let i=start-1;i<Math.min(start+9,rewards.length);i++){const name=rewards[i],l=i+1,cxp=i*250+i*(i-1)*25/2,unlocked=l<=d.level,card=el('div',undefined,'level'+(unlocked?' unlocked':' locked')+(l===d.level?' current':''));card.append(el('b','LVL '+l),el('span',name),el('span',l===d.level?'Текущий уровень':unlocked?'✓ Открыто':'🔒 Закрыто','clan-level-status'),el('small',cxp+' CXP'));if(d.leader&&unlocked&&l>1&&!name.includes('слот')&&!name.includes('монет')){const active=Object.values(d.decorations||{}).includes(l),choose=button(active?'Активно':'Применить',()=>run(async()=>{await api('cosmetic',{clanId:id,reward:l});await detail(id)}));choose.disabled=active;card.append(choose)}grid.append(card)}}
 for(let start=1;start<=rewards.length;start+=10){const b=button(start+'–'+Math.min(start+9,rewards.length),()=>showRange(start));rangeButtons.push([start,b]);ranges.append(b)}
 showRange(clanLevelRange||Math.floor((Math.max(1,level)-1)/10)*10+1);pane('levels').append(levels);
}
`;
