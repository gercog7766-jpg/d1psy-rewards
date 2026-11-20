export const clanShopCss=String.raw`
.clan-shop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:14px 0}
.clan-shop-card{min-width:0;padding:10px;border:1px solid #6d488d;border-radius:12px;background:#241732;display:grid;gap:8px;align-content:start}
.clan-shop-card b{overflow-wrap:anywhere}.clan-shop-card button{width:100%;padding:8px}
.clan-shop-preview{height:72px;display:grid;place-items:center;border-radius:8px;overflow:hidden;background:#160e29;color:#f5e5ff;font-size:14px;font-weight:800;letter-spacing:.06em;text-align:center}
.clan-shop-preview.frame:after{content:'D';display:grid;place-items:center;border:3px solid var(--shop-tone,#ad65ff);width:42px;height:42px;border-radius:12px;box-shadow:0 0 14px var(--shop-tone,#ad65ff);font-style:italic;font-size:26px}
.clan-shop-preview.background,.clan-shop-preview.banner{background:var(--shop-bg,#231730);border:1px solid #c495ff55}
.clan-shop-preview.tag{color:var(--shop-tone,#e4bbff);font-size:20px}
.shop-vote{padding:12px;border:1px solid #8859b6;border-radius:10px;margin:8px 0;background:#2b1940}
.shop-vote .row{margin-top:8px}.shop-spend{color:#ffb7d1}.shop-banner{display:block;padding:9px 15px;margin:10px 0;border-radius:8px;text-align:center;font-weight:800;letter-spacing:.1em;color:white}
@media(max-width:420px){.clan-shop-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.clan-shop-card{font-size:12px;padding:8px}}
`;
export const clanShopJs=String.raw`
const shopTones={frame_neon:'#dd63ff',frame_ice:'#7eeaff',frame_gold:'#ffd575',tag_amethyst:'#d89bff',tag_ice:'#93efff',tag_gold:'#ffdc83'};
const shopBgs={bg_night:'linear-gradient(155deg,#181329 25%,#352553 62%,#401e69)',bg_aurora:'radial-gradient(ellipse at 75% 5%,#33a58d,transparent 55%),linear-gradient(160deg,#102b48,#23113a)',bg_galaxy:'radial-gradient(circle at 80% 20%,#bc69f0,transparent 25%),radial-gradient(circle at 15% 70%,#285b9c,transparent 45%),#190e35',banner_syndicate:'linear-gradient(105deg,#231239,#8236cc,#32134a)',banner_frost:'linear-gradient(125deg,#193354,#619ab5,#45216c)',banner_royal:'linear-gradient(125deg,#432050,#a66b28,#2d153d)'};
const shopText={banner_syndicate:'SYNDICATE',banner_frost:'WINTER SYNDICATE',banner_royal:'ROYAL SYNDICATE'};
function applyShopDecorations(shop,h,emblem){
 const a=shop?.decorations||{};
 if(shopTones[a.frame]){emblem.style.border='3px solid '+shopTones[a.frame];emblem.style.boxShadow='0 0 16px '+shopTones[a.frame]}
 if(shopBgs[a.background])h.style.background=shopBgs[a.background];
 if(shopTones[a.tag])h.querySelector('h2').style.color=shopTones[a.tag];
 if(shopText[a.banner]){const b=el('div',shopText[a.banner],'shop-banner');b.style.background=shopBgs[a.banner];h.append(b)}
}
function renderClanShop(d,id,shopMount=root,treasuryMount=root){
 const s=d.shop;if(!s)return;
 const p=panel('Голосования и расширение клана'),active=s.proposals.find(v=>v.status==='pending');
 p.append(el('p','Любая покупка требует больше половины голосов всех участников. Голосование длится 24 часа; при изменении состава оно отменяется.','muted'));
 p.append(el('p','Платные места: '+s.paidSlots+'/15 · Всего мест: '+d.capacity+'/30','clan-own-rank'));
 const proposal=(item,label,price)=>run(async()=>{if(!await window.dropsoConfirm('Предложить покупку «'+label+'» за '+price+' монет из общака?'))return;await api('shop_propose',{clanId:id,item,requestId:crypto.randomUUID()});switchClanTab('treasury');await detail(id)});
 const slot=button(s.nextSlotCost==null?'Все слоты куплены':'Предложить +1 место · '+s.nextSlotCost+' монет',()=>proposal('slot','Дополнительный слот',s.nextSlotCost));
 slot.disabled=!!d.visitor||!!active||s.nextSlotCost==null||d.treasury<s.nextSlotCost;p.append(slot);
 for(const v of s.proposals){
  const status=({pending:'Голосование',approved:'Одобрено',rejected:'Отклонено',expired:'Истекло',cancelled:'Состав изменился'})[v.status]||v.status;
  const q=el('div',undefined,'shop-vote');q.append(el('b',v.label+' · '+v.amount+' монет · '+status),el('p','За: '+v.yes+'/'+v.required+' необходимых · против: '+v.no+' · участников: '+v.eligible,'muted'));
  if(v.status==='pending'){
   q.append(el('p','До '+formatStamp(v.expires_at),'muted'));
   if(d.visitor)q.append(el('p','Голосование доступно только участникам клана','muted'));
   else if(v.my_vote==null){const row=el('div',undefined,'row');for(const [label,approve] of [['За',true],['Против',false]])row.append(button(label,()=>run(async()=>{if(!await window.dropsoConfirm('Подтвердить голос «'+label+'»?'))return;await api('shop_vote',{clanId:id,proposalId:v.id,approve});await detail(id)})));q.append(row)}
   else q.append(el('p',v.my_vote?'Ты проголосовал за':'Ты проголосовал против','muted'));
  }
  p.append(q);
 }
 if(active)p.append(button('Обновить голосование',()=>run(()=>detail(id))));
 treasuryMount.append(p);
 const catalog=panel('Магазин оформлений');
 catalog.append(el('p','Баланс общака: '+d.treasury+' монет','clan-own-rank'));
 if(active)catalog.append(button('Перейти к голосованию →',()=>switchClanTab('treasury')));
 const labels={frame:'Рамки',background:'Фоны',banner:'Баннеры',tag:'Цвета названия'};
 for(const [kind,label] of Object.entries(labels)){
  catalog.append(el('h3',label));const grid=el('div',undefined,'clan-shop-grid');
  for(const item of s.catalog.filter(x=>x.kind===kind)){
   const card=el('div',undefined,'clan-shop-card'),preview=el('div',kind==='frame'?'':shopText[item.id]|| (kind==='tag'?'SYNDICATE':''),'clan-shop-preview '+kind);
   if(shopTones[item.id])preview.style.setProperty('--shop-tone',shopTones[item.id]);if(shopBgs[item.id])preview.style.setProperty('--shop-bg',shopBgs[item.id]);
   card.append(preview,el('b',item.name),el('span',item.owned?'Куплено':item.price+' монет','muted'));
   if(!item.owned){const b=button('Предложить',()=>proposal(item.id,item.name,item.price));b.disabled=!!d.visitor||!!active||d.treasury<item.price;card.append(b)}
   else if(d.leader){const selected=s.decorations?.[kind]===item.id;card.append(button(selected?'Снять оформление':'Применить',()=>run(async()=>{await api('shop_equip',{clanId:id,item:selected?'clear':item.id,kind});await detail(id)})))}
   grid.append(card);
  }
  catalog.append(grid);
 }
 shopMount.append(catalog);
}
`;
