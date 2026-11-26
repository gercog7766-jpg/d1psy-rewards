import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {previewDaily,previewWeekly,previewChallenges,previewReplace,type AssignedTask} from './season-two-tasks.js';
import {seasonTwoProgress,seasonTwoRewardDraft} from './season-two-draft.js';
import {testEntitlements} from './monetization-test-payments.js';
import {installObservedSeason} from './season-two-observed.js';
const flagsSchema=z.array(z.enum(['stream','partner','boss','draw','clan','upgrade','shop','withdraw','red'])).max(9);
const sampleSchema=z.number().int().min(1).max(999),daySchema=z.number().int().min(1).max(90);
const base={sample:sampleSchema,day:daySchema,revision:z.number().int().min(-1).max(2147483646)};
const command=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('assign'),flags:flagsSchema}).strict(),
 z.object({...base,action:z.literal('replace'),slot:z.number().int().min(0).max(2),flags:flagsSchema}).strict(),
 z.object({...base,action:z.literal('complete'),kind:z.enum(['daily','weekly','challenge']),slot:z.number().int().min(0).max(8)}).strict(),
 z.object({...base,action:z.literal('claim'),track:z.enum(['free','premium']),level:z.number().int().min(1).max(50)}).strict()
]);
type Command=z.infer<typeof command>;
type Group={tasks:AssignedTask[];mask:number;replaced?:boolean};
type Reward={kind:string;label:string;value:number};
type Receipt={track:'free'|'premium';level:number;reward:Reward};
export type TestState={season:string;rewards:{free:Reward;premium:Reward}[];days:Record<number,Group>;weeks:Record<number,Group>;months:Group[];receipts:Receipt[]};
export function createTestState(actor:string,season='NIGHT SHIFT · Season 2',rewards=seasonTwoRewardDraft() as TestState['rewards']):TestState{return {season,rewards,days:{},weeks:{},months:previewChallenges(actor).map(tasks=>({tasks,mask:0})),receipts:[]}}
const weekOf=(day:number)=>Math.ceil(day/7),monthOf=(day:number)=>Math.ceil(day/30)-1;
const bits=(n:number)=>n.toString(2).split('1').length-1;
export function testProgress(s:TestState){return seasonTwoProgress(Array.from({length:90},(_,i)=>s.days[i+1]?.mask||0),Array.from({length:13},(_,i)=>bits(s.weeks[i+1]?.mask||0)),s.months.map(m=>m.mask))}
export function applyTestCommand(s:TestState,actor:string,c:Command,premium:boolean){
 const day=c.day,week=weekOf(day),month=monthOf(day);
 if(c.action==='assign'){const flags=new Set(c.flags);s.days[day]??={tasks:previewDaily(actor,day,flags),mask:0,replaced:false};s.weeks[week]??={tasks:previewWeekly(actor,week,flags),mask:0};return}
 if(!s.days[day]||!s.weeks[week])throw Error('day_not_assigned');
 if(c.action==='claim'){if(c.level>testProgress(s).level)throw Error('level_locked');if(c.track==='premium'&&!premium)throw Error('premium_required');if(!s.receipts.some(r=>r.level===c.level&&r.track===c.track))s.receipts.push({track:c.track,level:c.level,reward:s.rewards[c.level-1][c.track]});return}
 if(c.action==='replace'){const g=s.days[day];g.tasks=previewReplace(actor,day,g.tasks,c.slot,new Set(c.flags),!!g.replaced,!!(g.mask&(1<<c.slot)));g.replaced=true;return}
 const g=c.kind==='daily'?s.days[day]:c.kind==='weekly'?s.weeks[week]:s.months[month];if(c.slot>=g.tasks.length)throw Error('invalid_slot');g.mask|=1<<c.slot;
}
const path='/api/admin/monetization/s2-progress';
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S2 · Тест прогресса</title><style>*{box-sizing:border-box}body{background:#110c1b;color:#f5eaff;font:15px/1.5 system-ui;margin:auto;max-width:1000px;padding:20px}a{color:#d8acff}section{background:#21182e;border:1px solid #654882;border-radius:14px;padding:16px;margin:12px 0}button,input,select{background:#34224b;color:white;border:1px solid #8053a4;border-radius:8px;font:inherit;padding:8px}button{cursor:pointer}button:disabled{opacity:.5}input[type=number]{width:85px}label{display:inline-flex;gap:5px;align-items:center;margin:5px}article{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px;border-bottom:1px solid #533965}article span{flex:1;min-width:160px}strong{color:#ffdc9d}#status{min-height:1.5em;color:#ffdc9d}</style><body><a href="/admin/monetization/s2-tasks">← Задания</a><h1>Night Shift S2 · Тест прогресса</h1><section><strong>Только ADMIN TEST</strong><p>Симуляция выполнения, SP и квитанций. Не выдаёт настоящие награды. PREMIUM доступен после серверной тестовой покупки Battle Pass.</p><label>Профиль <input id="sample" type="number" min="1" max="999" value="1"></label><label>День <input id="day" type="number" min="1" max="90" value="1"></label><div id="flags">${flagsSchema.element.options.map(x=>`<label><input type="checkbox" value="${x}">${x}</label>`).join('')}</div><button id="open">Открыть тестовый день</button><p id="status" role="status"></p></section><section id="summary"></section><section id="tasks"></section><section><h2>Тестовые награды</h2><label>Уровень <input id="level" type="number" min="1" max="50" value="1"></label><button id="free" disabled>Получить FREE</button> <button id="premium" disabled>Получить PREMIUM</button><div id="receipts"></div></section><script src="${path}-script" defer></script></body></html>`;
const script=String.raw`(()=>{const $=id=>document.getElementById(id),node=(tag,t)=>{const n=document.createElement(tag);n.textContent=t;return n};let current=null,busy=false;const sample=()=>Number($('sample').value),day=()=>Number($('day').value),flags=()=>[...$('flags').querySelectorAll('input:checked')].map(x=>x.value);async function request(action,extra={}){if(busy)return;busy=true;try{const s=sample(),d=day();if(action==='assign'){const r=await fetch('${path}?sample='+s,{cache:'no-store'});if(!r.ok)throw Error('Не удалось загрузить профиль');current=await r.json()}else if(!current||current.sample!==s||current.day!==d)throw Error('Сначала откройте тестовый день');const r=await fetch('${path}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,sample:s,day:d,revision:current.revision,...extra})});const data=await r.json();if(!r.ok)throw Error(data.error||'Ошибка');current=data;render();$('status').textContent='Сохранено на сервере'}catch(e){$('status').textContent=e.message+' · При конфликте откройте день заново.'}finally{busy=false}}function render(){const {state:s,progress:p,day:d,premium}=current;$('summary').textContent='LVL '+p.level+' · '+p.sp+' SP · недельных '+p.weekly+'/111 · испытаний '+p.challenges+'/9 · PREMIUM '+(premium?'активен (TEST)':'не активен');const root=$('tasks');root.replaceChildren();for(const [kind,title,g] of [['daily','Дневные',s.days[d]],['weekly','Недельные',s.weeks[Math.ceil(d/7)]],['challenge','Испытания',s.months[Math.ceil(d/30)-1]]]){root.append(node('h2',title));g.tasks.forEach((t,i)=>{const row=node('article',''),done=!!(g.mask&(1<<i));row.append(node('span',t.label+' · '+t.sp+' SP'));const b=node('button',done?'Выполнено':'Симулировать выполнение');b.disabled=done;b.onclick=()=>request('complete',{kind,slot:i});row.append(b);if(kind==='daily'){const b=node('button','Заменить');b.disabled=done||g.replaced;b.onclick=()=>request('replace',{slot:i,flags:flags()});row.append(b)}root.append(row)})}$('free').disabled=p.level===0;$('premium').disabled=!premium||p.level===0;$('receipts').replaceChildren(...s.receipts.map(r=>node('p',r.track.toUpperCase()+' · LVL '+r.level+' · '+r.reward.label+' (TEST)')))}$('open').onclick=()=>request('assign',{flags:flags()});$('free').onclick=()=>request('claim',{track:'free',level:Number($('level').value)});$('premium').onclick=()=>request('claim',{track:'premium',level:Number($('level').value)});})();`;
export function installSeasonTest(app:Express,db:SupabaseClient,admin:RequestHandler,origin:string){
 installObservedSeason(app,db,admin);
 const privateGet:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private,no-store');n()};
 app.get('/admin/monetization/s2-progress',privateGet,admin,(_q,r)=>r.type('html').send(html.replace('<h1>','<p><a href="/admin/monetization/s2-real">Battle Pass S2 · реальный прогресс (TEST) ↗</a> · <a href="/admin/monetization/s2-observed">Реальные события · проверка прогресса ↗</a></p><h1>')));
 app.get(path+'-script',privateGet,admin,(_q,r)=>r.type('application/javascript').send(script));
 const read=(actor:string,sample:number)=>db.from('rewards_s2_test_profiles').select('revision,state').eq('actor',actor).eq('sample',sample).maybeSingle();
 app.get(path,privateGet,admin,async(q,r)=>{const sample=sampleSchema.safeParse(Number(q.query.sample));if(!sample.success)return void r.sendStatus(400);const {data,error}=await read(r.locals.session.twitchUserId,sample.data);if(error)return void r.status(503).json({error:'test_storage_unavailable'});r.json({sample:sample.data,revision:data?.revision??-1,testOnly:true})});
 app.post(path,privateGet,admin,async(q,r)=>{
  if(q.get('origin')!==origin||!q.is('application/json'))return void r.sendStatus(403);
  const parsed=command.safeParse(q.body);if(!parsed.success)return void r.status(400).json({error:'invalid_command'});
  const c=parsed.data,actor=String(r.locals.session.twitchUserId),seed=actor+':test:'+c.sample;
  const {data,error}=await read(actor,c.sample);if(error)return void r.status(503).json({error:'test_storage_unavailable'});
  if((data?.revision??-1)!==c.revision)return void r.status(409).json({error:'test_conflict'});
  let state:TestState;
  if(data)state=data.state;else{if(c.action!=='assign')return void r.status(409).json({error:'day_not_assigned'});const draft=await db.from('rewards_monetization_draft').select('config').eq('id',true).single();if(draft.error)return void r.status(503).json({error:'draft_unavailable'});const bp=draft.data?.config?.battlePass;state=createTestState(seed,bp?.season||undefined,Array.isArray(bp?.levels)&&bp.levels.length===50&&!bp.levels.every((x:{free:Reward;premium:Reward})=>x.free.kind==='none'&&x.premium.kind==='none')?bp.levels:undefined)}
  const paid=await db.from('rewards_monetization_test_orders').select('product,season,days,paid_at').eq('actor',actor).eq('state','paid').eq('product','battlePass').eq('season',state.season).order('paid_at').limit(1000);if(paid.error)return void r.status(503).json({error:'test_ledger_unavailable'});
  const premium=testEntitlements(paid.data||[]).some(x=>x.product==='battlePass:'+state.season&&x.active);
  try{applyTestCommand(state,seed,c,premium)}catch(e){return void r.status(409).json({error:e instanceof Error?e.message:'invalid_command'})}
  const revision=c.revision+1,record={state,revision,updated_at:new Date().toISOString()};const saved=data?await db.from('rewards_s2_test_profiles').update(record).eq('actor',actor).eq('sample',c.sample).eq('revision',c.revision).select('revision').maybeSingle():await db.from('rewards_s2_test_profiles').insert({...record,actor,sample:c.sample}).select('revision').single();
  if(saved.error&&saved.error.code!=='23505')return void r.status(503).json({error:'test_storage_unavailable'});if(!saved.data)return void r.status(409).json({error:'test_conflict'});
  r.json({sample:c.sample,day:c.day,revision,state,progress:testProgress(state),premium,testOnly:true});
 });
}
