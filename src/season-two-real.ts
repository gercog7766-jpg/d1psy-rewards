import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {createTestState,testProgress,type TestState} from './season-two-test.js';
import {previewDaily,previewWeekly,previewReplace,type Availability} from './season-two-tasks.js';
import {readObserved,observedTask,type Observed} from './season-two-observed.js';
import {seasonTwoRewardDraft,seasonTwoThresholds} from './season-two-draft.js';
import {testEntitlements} from './monetization-test-payments.js';
import {fullCoinBalance} from './coin-ledger-paged.js';

type Metric={progress:number;complete:boolean}|null;
type Group=TestState['days'][number];
export type RealState=TestState&{start:string;lastDay:number;lastSync:number;metrics:Record<string,Metric[]>;closed?:boolean};
const plusDays=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
export const moscowDay=(now=Date.now())=>new Date(now+3*3600000).toISOString().slice(0,10);
const weekOf=(day:number)=>Math.ceil(day/7),monthOf=(day:number)=>Math.ceil(day/30);
export function realDay(start:string,now=Date.now()){return Math.floor((Date.parse(moscowDay(now))-Date.parse(start))/86400000)+1}
export function newRealState(actor:string,start:string,season?:string,rewards?:TestState['rewards']):RealState{return {...createTestState(actor,season,rewards),start,lastDay:0,lastSync:0,metrics:{}}}
export function assignRealDay(s:RealState,seed:string,day:number,flags:ReadonlySet<Availability>){
 if(day<1||day>90)throw Error('season_finished');
 s.days[day]??={tasks:previewDaily(seed,day,flags),mask:0,replaced:false};
 s.weeks[weekOf(day)]??={tasks:previewWeekly(seed,weekOf(day),flags),mask:0};
}
export function reconcileRealGroup(s:RealState,key:string,g:Group,d:Observed){
 const results=g.tasks.map(t=>observedTask(t,d));
 // Server-derived completion bits are idempotent; missing source data cannot invent SP.
 for(let i=0;i<results.length;i++){if(results[i]?.complete)g.mask|=1<<i;}
 s.metrics[key]=results;
}
export function replaceReal(s:RealState,seed:string,day:number,slot:number,flags:ReadonlySet<Availability>){const g=s.days[day];if(!g)throw Error('day_not_assigned');g.tasks=previewReplace(seed,day,g.tasks,slot,flags,!!g.replaced,!!(g.mask&(1<<slot)));g.replaced=true;if(s.metrics['d'+day])s.metrics['d'+day][slot]=null;}
type Window={key:string;group:Group;start:string;days:number};
// Current and previously opened periods are reconciled once at rollover. No
// invented retrospective daily assignments on dates the closed test was not used.
export function realWindows(s:RealState,day:number):Window[]{
 const windows=new Map<string,Window>(),add=(key:string,group:Group|undefined,offset:number,days:number)=>{if(group)windows.set(key,{key,group,start:plusDays(s.start,offset),days})};
 for(const d of new Set([s.lastDay,Math.min(day,90)])){if(d<1||d>90)continue;const w=weekOf(d),m=monthOf(d);add('d'+d,s.days[d],d-1,1);add('w'+w,s.weeks[w],(w-1)*7,Math.min(7,90-(w-1)*7));add('m'+m,s.months[m-1],(m-1)*30,30)}
 return [...windows.values()];
}
async function available(db:SupabaseClient,user:{id:string;steam_trade_url_valid?:boolean}){
 const flags=new Set<Availability>(),now=new Date().toISOString();
 const [live,primary,events,clan,red,inv,balance]=await Promise.all([
  db.from('rewards_live_economy_channels').select('broadcaster').eq('live',true).gt('observed_at',new Date(Date.now()-360000).toISOString()),
  db.from('rewards_streamers').select('twitch_broadcaster_id').eq('is_primary',true),db.rpc('rewards_live_economy_events'),
  db.from('rewards_clan_members').select('id').eq('user_id',user.id).is('left_at',null).limit(1),
  db.from('rewards_red_button_rounds').select('id').is('closed_at',null).lte('starts_at',now).gt('ends_at',now).limit(1),
  db.from('rewards_wins').select('id').eq('user_id',user.id).eq('choice_status','awaiting_choice').limit(1),
  user.steam_trade_url_valid?fullCoinBalance(db,user.id).catch(()=>0):Promise.resolve(0)]);
 if(!live.error&&live.data?.length){flags.add('stream');if(!primary.error&&primary.data?.length&&live.data.some(x=>!primary.data!.some(p=>p.twitch_broadcaster_id===x.broadcaster)))flags.add('partner')}
 if(!events.error&&Array.isArray(events.data)){if(events.data.some(x=>x.boss===true))flags.add('boss');if(events.data.some(x=>x.giveaway===true))flags.add('draw')}
 if(!clan.error&&!clan.data?.length)flags.add('clan');if(!red.error&&red.data?.length)flags.add('red');
 if(!inv.error&&inv.data?.length){flags.add('upgrade');if(user.steam_trade_url_valid)flags.add('withdraw')}
 if(balance>=250)flags.add('shop');return flags;
}
type RealUser={id:string;steam_trade_url_valid?:boolean};
type SyncDeps={now:()=>number;read:typeof readObserved;availability:typeof available};
const realDeps:SyncDeps={now:Date.now,read:readObserved,availability:available};
// Shared by the admin page and the background worker. All credit remains in
// the existing isolated JSON profile; no wallet, inventory or S1 writes.
export async function synchronizeRealState(db:SupabaseClient,s:RealState,seed:string,user:RealUser,replaceSlot?:number,deps:SyncDeps=realDeps){
 const rawDay=realDay(s.start,deps.now()),day=Math.min(90,Math.max(1,rawDay)),ended=rawDay>90;
 if(!Number.isInteger(rawDay)||rawDay<1)throw Error('invalid_season_day');
 if(ended&&replaceSlot!==undefined)throw Error('season_finished');if(s.closed)return;
 const flags=(!ended&&(!s.days[day]||replaceSlot!==undefined))?await deps.availability(db,user):new Set<Availability>();
 if(!ended)assignRealDay(s,seed,day,flags);
 if(replaceSlot!==undefined){reconcileRealGroup(s,'d'+day,s.days[day],await deps.read(db,user,plusDays(s.start,day-1),1));replaceReal(s,seed,day,replaceSlot,flags)}
 for(const w of realWindows(s,day)){const data=await deps.read(db,user,w.start,w.days);reconcileRealGroup(s,w.key,w.group,data)}
 if(realDay(s.start,deps.now())!==rawDay)throw Error('day_changed');s.lastDay=day;s.lastSync=deps.now();if(ended)s.closed=true;
}
export async function runRealSeasonBackground(db:SupabaseClient,busy:Set<string>,deps:SyncDeps=realDeps){
 const rows=await db.from('rewards_s2_test_profiles').select('actor,revision,state').eq('sample',1).like('actor','s2-real:%').order('updated_at').limit(100);
 if(rows.error)throw Error('s2_background_profiles_unavailable');let updated=0,failed=0;
 for(const row of rows.data||[]){const key=String(row.actor),actor=key.slice('s2-real:'.length),s:RealState=row.state;
  if(!key.startsWith('s2-real:')||!actor||!s?.start||s.closed||busy.has(key)||deps.now()-Number(s.lastSync||0)<300000&&s.lastDay===Math.min(90,realDay(s.start,deps.now())))continue;
  busy.add(key);try{
   const [admin,user]=await Promise.all([db.from('rewards_admins').select('twitch_user_id').eq('twitch_user_id',actor).maybeSingle(),db.from('rewards_users').select('id,steam_trade_url_valid,banned').eq('twitch_user_id',actor).maybeSingle()]);
   if(admin.error||user.error)throw Error('s2_background_actor_unavailable');if(!admin.data||!user.data||user.data.banned)continue;
   await synchronizeRealState(db,s,key,user.data,undefined,deps);
   const saved=await db.from('rewards_s2_test_profiles').update({state:s,revision:row.revision+1,updated_at:new Date(deps.now()).toISOString()}).eq('actor',key).eq('sample',1).eq('revision',row.revision).select('revision').maybeSingle();
   if(saved.error)throw Error('s2_background_save_failed');if(saved.data)updated++;
  }catch{failed++}finally{busy.delete(key)}
 }
 return {updated,failed};
}
function startRealSeasonBackground(db:SupabaseClient,busy:Set<string>){
 if(process.env.REWARDS_ENGINE_ENABLED==='false')return;let running=false;const tick=async()=>{if(running)return;running=true;try{const result=await runRealSeasonBackground(db,busy);if(result.failed)console.warn('s2_background_partial_failure',result.failed)}catch{console.warn('s2_background_unavailable')}finally{running=false}};
 const first=setTimeout(()=>{void tick();const timer=setInterval(()=>void tick(),300000);timer.unref()},60000);first.unref();
}
const path='/api/admin/monetization/s2-real',page='/admin/monetization/s2-real';
export const realSeasonHtml=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Night Shift S2 · Battle Pass</title><style>
*{box-sizing:border-box}body{margin:0;background:#100c19;color:#f8eeff;font:15px/1.5 system-ui}main{max-width:1200px;margin:auto;padding:24px 16px 70px}a{color:#d6a8ff}h1,h2,h3,p{margin:0 0 12px}button{font:inherit;font-weight:700;color:white;background:#7434bd;border:1px solid #a76be9;border-radius:9px;padding:9px 13px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.hero{background:radial-gradient(ellipse at 95% 0,#6131a3a0,transparent 60%),linear-gradient(130deg,#281442,#15101f);border:1px solid #8051b6;border-radius:20px;padding:clamp(20px,4vw,40px);margin:16px 0}.hero h1{font-size:clamp(30px,5vw,58px);line-height:1.1;letter-spacing:-.04em}.eyebrow{color:#dba7ff;font-weight:800;letter-spacing:.14em;font-size:12px}.notice{color:#f9dca5;background:#382b2c;border:1px solid #886e46;padding:12px;border-radius:10px}.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0}.stat,.panel{border:1px solid #523769;background:#21162e;border-radius:14px;padding:16px}.stat b{display:block;font-size:24px;color:#e3b6ff}.stat small,.muted{color:#c9b6d5}.track{margin-top:14px}.track progress,progress{width:100%;height:12px;accent-color:#a34df5}.panel{margin:14px 0}.taskgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px}.task{border:1px solid #674782;border-radius:11px;background:#2c1d3c;padding:12px;display:flex;flex-direction:column;gap:6px;min-height:116px}.task.done{border-color:#3d886c;background:#1e332f}.task p{flex:1;margin:0}.task strong{color:#ffe0a4}.task button{align-self:flex-start}.reward-row{display:grid;grid-template-columns:68px minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:stretch;margin:8px 0}.reward{padding:11px;border:1px solid #5a426b;background:#281b34;border-radius:10px;min-width:0;overflow-wrap:anywhere}.reward.premium{background:linear-gradient(135deg,#46236c,#25202e);border-color:#93613b}.reward.claimed{border-color:#4b9873}.reward button{margin-top:8px;width:100%;font-size:12px}.reward-head{font-weight:800;color:#d9a9ff}.reward-level{display:grid;place-content:center;text-align:center;font-size:20px;font-weight:900;color:#d4a1ff}.reward-level small{font-size:10px;color:#bda8cd}.premium .reward-head{color:#ffd790}.status{min-height:1.5em;color:#ffe0a3}.final{border-color:#d5ac6a!important;box-shadow:0 0 16px #d5ac6a22}@media(max-width:520px){main{padding:14px 10px 40px}.panel{padding:11px}.reward-row{grid-template-columns:40px minmax(0,1fr) minmax(0,1fr);gap:5px}.reward{padding:8px;font-size:12px}.reward-level{font-size:16px}.reward-level small{font-size:9px}}
</style></head><body><main><a href="/admin/monetization">← Монетизация</a><section class="hero"><p class="eyebrow">DROPSO · ADMIN TEST · SEASON 02</p><h1>NIGHT SHIFT<br>Battle Pass</h1><p class="muted">90 дней · 50 уровней · FREE & PREMIUM</p><p class="notice">Закрытый режим. Прогресс берётся из реальных событий твоего аккаунта, но SP и получение наград сохраняются только в тестовом профиле. После начала теста сервер обновляет задания и SP каждые пять минут даже при закрытом сайте. Настоящие предметы, монеты и текущий сезон не затрагиваются.</p><div class="row"><button id="sync">Начать тест / обновить</button><a href="/admin/monetization/premium">Тестовый PREMIUM</a><a href="/admin/monetization/s2-progress">Ручной симулятор</a></div><p id="status" class="status" role="status"></p><div id="stats" class="stats"></div><div id="track" class="track"></div></section><div id="content" hidden><section class="panel"><h2>Ежедневные задания</h2><p class="muted">Три задания · одна замена в сутки</p><div class="taskgrid" id="daily"></div></section><section class="panel"><h2>Еженедельные задания</h2><div class="taskgrid" id="weekly"></div></section><section class="panel"><h2>Испытания месяца</h2><div class="taskgrid" id="challenge"></div></section><section class="panel"><h2>Награды сезона</h2><p class="muted">FREE доступен всем тестерам. PREMIUM открывается после тестовой оплаты. Награды здесь — только квитанции.</p><div class="reward-row"><div></div><div class="reward-head">FREE</div><div class="reward-head">PREMIUM</div></div><div id="rewards"></div></section></div></main><script src="${path}-script" defer></script></body></html>`;
export const realSeasonJs=String.raw`(()=>{const $=id=>document.getElementById(id),el=(tag,t,cls)=>{const n=document.createElement(tag);if(t!=null)n.textContent=t;if(cls)n.className=cls;return n};let current=null,busy=false,started=false;async function send(action,extra={}){if(busy)return;busy=true;$('sync').disabled=true;$('status').textContent='Проверяем реальные события…';try{const r=await fetch('${path}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}),d=await r.json();if(!r.ok)throw Error(d.error||'Ошибка');current=d;started=true;render();$('status').textContent='Прогресс синхронизирован · '+new Date(d.state.lastSync).toLocaleTimeString('ru-RU')}catch(e){$('status').textContent='Не удалось обновить: '+e.message}finally{busy=false;$('sync').disabled=false}}function taskGroup(root,g,key,replace){root.replaceChildren();if(!g){root.append(el('p','Задания не назначены'));return}g.tasks.forEach((t,i)=>{const done=!!(g.mask&(1<<i)),m=current.state.metrics[key]?.[i],card=el('article',null,'task'+(done?' done':''));card.append(el('strong','+'+t.sp+' SP'),el('p',t.label));const predicate=['milliseconds','attempts','errors','price','multiplier','percent'].includes(t.unit);card.append(el('span',done?'✓ Выполнено':m==null?'Ожидается источник':predicate?'Условие пока не выполнено':m.progress+' / '+t.target,'muted'));if(!predicate&&m!=null){const p=el('progress');p.max=Math.max(1,t.target);p.value=done?t.target:m.progress;card.append(p)}if(replace&&!done&&!g.replaced&&!current.ended){const b=el('button','Заменить');b.onclick=()=>send('replace',{slot:i,day:current.day,revision:current.revision});card.append(b)}root.append(card)})}function stat(label,value){const n=el('div',null,'stat');n.append(el('small',label),el('b',value));return n}function rewardCard(track,level,reward){const got=current.state.receipts.some(r=>r.track===track&&r.level===level),accessible=level<=current.progress.level&&(track==='free'||current.premium),n=el('div',null,'reward '+track+(got?' claimed':'')+(level===50?' final':''));n.append(el('strong',reward.label||'Без награды','reward-head'));if(reward.value)n.append(el('div',reward.value.toLocaleString('ru-RU')+' монет · оценка','muted'));const b=el('button',got?'✓ Получено (TEST)':accessible?'Получить (TEST)':track==='premium'&&!current.premium?'PREMIUM закрыт':'Уровень закрыт');b.disabled=got||!accessible;b.onclick=()=>send('claim',{track,level,revision:current.revision});n.append(b);return n}function render(){const {state:s,day,premium,progress:p,thresholds:th}=current;$('content').hidden=false;$('stats').replaceChildren(stat('Текущий уровень',p.level+' / 50'),stat('Сезонные очки',p.sp.toLocaleString('ru-RU')+' SP'),stat('День сезона',day+' / 90'),stat('Недельные',p.weekly+' / 111'),stat('Испытания',p.challenges+' / 9'),stat('PREMIUM',premium?'Активен TEST':'Не активен'));const low=p.level?th[p.level-1]:0,high=th[p.level]??th[49],bar=el('progress');bar.max=Math.max(1,high-low);bar.value=Math.min(bar.max,Math.max(0,p.sp-low));$('track').replaceChildren(el('p',p.level===50?'Максимальный уровень':p.level===49&&p.sp>=high?'Порог SP достигнут · нужны обязательные задания':'До следующего уровня: '+Math.max(0,high-p.sp)+' SP'),bar,el('p','До 50 уровня: '+p.remainingDaily+' дневных наборов · '+p.remainingWeekly+' недельных · '+p.remainingChallenges+' испытаний','muted'));taskGroup($('daily'),s.days[day],'d'+day,true);const w=Math.ceil(day/7),m=Math.ceil(day/30);taskGroup($('weekly'),s.weeks[w],'w'+w,false);taskGroup($('challenge'),s.months[m-1],'m'+m,false);const root=$('rewards');root.replaceChildren(...s.rewards.map((r,i)=>{const n=el('article',null,'reward-row'),lv=el('div',null,'reward-level');lv.append(el('span',i+1),el('small',th[i]+' SP'));n.append(lv,rewardCard('free',i+1,r.free),rewardCard('premium',i+1,r.premium));return n}))}$('sync').onclick=()=>send('sync');setInterval(()=>{if(started&&!document.hidden)send('sync')},120000)})();`;
const command=z.discriminatedUnion('action',[z.object({action:z.literal('sync')}).strict(),z.object({action:z.literal('replace'),slot:z.number().int().min(0).max(2),day:z.number().int().min(1).max(90),revision:z.number().int().min(0)}).strict(),z.object({action:z.literal('claim'),track:z.enum(['free','premium']),level:z.number().int().min(1).max(50),revision:z.number().int().min(0)}).strict()]);
export function installRealSeason(app:Express,db:SupabaseClient,admin:RequestHandler,origin:string){
 const guard:RequestHandler=(_q,r,next)=>{r.set('Cache-Control','private,no-store');next()};
 const busy=new Set<string>();
 startRealSeasonBackground(db,busy);
 app.get(page,guard,admin,(_q,r)=>r.type('html').send(realSeasonHtml));
 app.get(path+'-script',guard,admin,(_q,r)=>r.type('application/javascript').send(realSeasonJs));
 app.post(path,guard,admin,async(q,r)=>{
  if(q.get('origin')!==origin||!q.is('application/json'))return void r.sendStatus(403);const parsed=command.safeParse(q.body);if(!parsed.success)return void r.status(400).json({error:'invalid_command'});
  const c=parsed.data,actor=String(r.locals.session.twitchUserId),key='s2-real:'+actor;if(busy.has(key))return void r.status(409).json({error:'sync_in_progress'});busy.add(key);
  try{
   const [record,account]=await Promise.all([db.from('rewards_s2_test_profiles').select('revision,state').eq('actor',key).eq('sample',1).maybeSingle(),db.from('rewards_users').select('id,steam_trade_url_valid').eq('twitch_user_id',actor).maybeSingle()]);
   if(record.error||account.error||!account.data)throw Error('test_storage_unavailable');const user=account.data;let s:RealState,revision=record.data?.revision??-1;
   if(record.data)s=record.data.state;else{if(c.action!=='sync')return void r.status(409).json({error:'start_test_first'});const draft=await db.from('rewards_monetization_draft').select('config').eq('id',true).single();if(draft.error)throw Error('draft_unavailable');const bp=draft.data?.config?.battlePass;const rewards=Array.isArray(bp?.levels)&&bp.levels.length===50&&!bp.levels.every((x:{free:{kind:string};premium:{kind:string}})=>x.free.kind==='none'&&x.premium.kind==='none')?bp.levels:seasonTwoRewardDraft();s=newRealState(key,moscowDay(),bp?.season,rewards)}
   if(c.action!=='sync'&&c.revision!==revision)return void r.status(409).json({error:'test_conflict'});
   const rawDay=realDay(s.start),day=Math.min(90,Math.max(1,rawDay)),ended=rawDay>90;
   if(c.action==='replace'&&c.day!==day)return void r.status(409).json({error:'day_changed'});
   const paid=await db.from('rewards_monetization_test_orders').select('product,season,days,paid_at').eq('actor',actor).eq('state','paid').eq('product','battlePass').eq('season',s.season).order('paid_at').limit(1000);if(paid.error)throw Error('test_ledger_unavailable');const premium=testEntitlements(paid.data||[]).some(x=>x.product==='battlePass:'+s.season&&x.active);
   const response=()=>({revision,state:s,day,ended,premium,progress:testProgress(s),thresholds:seasonTwoThresholds,testOnly:true});
   // A short cache prevents duplicate tabs or manual clicks from flooding sources.
   if(c.action==='sync'&&(s.closed||s.lastDay===day&&Date.now()-s.lastSync<60000))return void r.json(response());
   if(c.action==='claim'){
    if(c.level>testProgress(s).level)return void r.status(409).json({error:'level_locked'});if(c.track==='premium'&&!premium)return void r.status(409).json({error:'premium_required'});
    if(s.receipts.some(x=>x.level===c.level&&x.track===c.track))return void r.json(response());s.receipts.push({track:c.track,level:c.level,reward:s.rewards[c.level-1][c.track]});
   }else{
    try{await synchronizeRealState(db,s,key,user,c.action==='replace'?c.slot:undefined)}catch(e){const reason=e instanceof Error?e.message:'';if(['replacement_unavailable','season_finished','day_changed'].includes(reason))return void r.status(409).json({error:reason});throw e}
    if(realDay(s.start)!==rawDay)return void r.status(409).json({error:'day_changed'});
   }
   const next=revision+1,payload={state:s,revision:next,updated_at:new Date().toISOString()};const saved=record.data?await db.from('rewards_s2_test_profiles').update(payload).eq('actor',key).eq('sample',1).eq('revision',revision).select('revision').maybeSingle():await db.from('rewards_s2_test_profiles').insert({...payload,actor:key,sample:1}).select('revision').single();if(saved.error&&saved.error.code!=='23505')throw Error('test_storage_unavailable');if(!saved.data)return void r.status(409).json({error:'test_conflict'});revision=next;r.json(response());
  }catch(e){r.status(503).json({error:e instanceof Error?e.message:'test_unavailable'})}finally{busy.delete(key)}
 });
}
