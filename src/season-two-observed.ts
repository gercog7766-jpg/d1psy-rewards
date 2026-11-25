import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {dailyTasks,weeklyTasks,challenges,type SeasonTask} from './season-two-tasks.js';

type Game={status:string;difficulty:string;started_at:string;finished_at:string;mistakes?:number};
type Run={version:number;distance:number;tick:number;collected_coins:number;coins:number;status:string};
type Word={answer:string;guesses:string[]};
type Upgrade={result:string;chance_bps:number;source_value_coins:number;target_value_coins:number;extra_coins:number};
export type Observed={mine:Game[];defuse:Game[];night:Run[];word:Word[];upgrade:Upgrade[];bonus:{id:string}[];live:{seconds:number;messages:number;broadcaster?:string}[];primary?:string[];clan?:number;boss?:number;xp?:number;redSeconds?:number;ttt?:number};
const sum=(a:number[])=>a.reduce((s,n)=>s+n,0),max=(a:number[])=>Math.max(0,...a);
const time=(g:Game)=>Date.parse(g.finished_at)-Date.parse(g.started_at);
export function observedTask(task:SeasonTask,d:Observed):{progress:number;complete:boolean}|null{
 const id=task.id,goal=task.target;
 const count=(p:number)=>({progress:Math.min(goal,p),complete:p>=goal});
 const condition=(ok:boolean)=>({progress:ok?1:0,complete:ok});
 const win=(g:Game)=>g.status==='won';
 const timed=(g:Game)=>win(g)&&Number.isFinite(time(g))&&time(g)>=0&&time(g)<goal;
 const mine=(mode:string)=>d.mine.filter(g=>g.difficulty===mode&&win(g));
 const def=(mode:string)=>d.defuse.filter(g=>g.difficulty===mode&&win(g));
 const words=d.word.map(g=>g.guesses.indexOf(g.answer)+1).filter(n=>n>0);
 const runs=d.night.filter(g=>['stopped','crashed','expired'].includes(g.status)),dist=(g:Run)=>g.version===1?g.tick*2:Math.floor(g.distance/40),coins=(g:Run)=>g.version>=3?g.collected_coins:g.coins;
 const upgrades=d.upgrade.filter(g=>g.result==='won'),ratio=(g:Upgrade)=>g.target_value_coins/Math.max(1,g.source_value_coins+(g.extra_coins||0));
 switch(id){
 case 'watch15':case 'watch30':case 'watch60':case 'wWatch10h':case 'cWatch65h':return count(Math.floor(sum(d.live.map(g=>g.seconds))/60));
 case 'partnerVisit':case 'partner20':case 'wPartner7h':{if(!d.primary?.length)return null;const partners=d.live.filter(g=>g.broadcaster&&!d.primary!.includes(g.broadcaster));return id==='partnerVisit'?condition(partners.some(g=>g.seconds>0)):count(Math.floor(sum(partners.map(g=>g.seconds))/60))}
 case 'chat25':case 'chat50':case 'chat100':case 'wChat700':return count(sum(d.live.map(g=>g.messages)));
 case 'bonus1':case 'wBonus7':return count(d.bonus.length);
 case 'clanJoin':return d.clan===undefined?null:count(d.clan);
 case 'boss1':case 'boss2':case 'boss3':case 'wBoss20':return d.boss===undefined?null:count(d.boss);
 case 'xp50':case 'xp100':case 'xp200':case 'wXp1500':return d.xp===undefined?null:count(d.xp);
 case 'wRed120':case 'cRed20h':return d.redSeconds===undefined?null:count(Math.floor(d.redSeconds/60));
 case 'ttt1':case 'ttt3':return d.ttt===undefined?null:count(d.ttt);
 case 'mineEasy':case 'wMineEasy5':return count(mine('easy').length);
 case 'mineMedium':case 'wMineMedium3':return count(mine('medium').length);
 case 'mineEasy60':case 'wMineEasy30':return condition(mine('easy').some(timed));
 case 'wMineMedium240':return condition(mine('medium').some(timed));
 case 'cMine240':return condition(mine('hard').some(timed));
 case 'defEasy':case 'wDefEasy5':return count(def('rookie').length);
 case 'wDefMedium3':return count(def('swat').length);
 case 'wDefHard1':return count(def('expert').length);
 case 'defMedium15':case 'wDefMedium15':return condition(def('swat').some(timed));
 case 'cDef1130':return condition(def('expert').some(timed));
 case 'defPerfect':return condition(d.defuse.some(g=>win(g)&&g.mistakes===0));
 case 'wordWin':case 'wWord5':case 'cWord25':return count(words.length);
 case 'word4':case 'wWord3':return condition(words.some(n=>n<=goal));
 case 'wWord4x2':return count(words.filter(n=>n<=4).length);
 case 'run1000':case 'run2500':case 'run5000':case 'wRun25k':case 'cRun111111':return count(max(runs.map(dist)));
 case 'wRun100k':case 'cRun1m':return count(sum(runs.map(dist)));
 case 'run5coins':case 'run10coins':return count(max(runs.map(coins)));
 case 'wRun50coins':return count(sum(runs.map(coins)));
 case 'wRun10x3':return count(runs.filter(g=>coins(g)>=10).length);
 case 'upgrade1':case 'wUpgrade15':return count(d.upgrade.length);
 case 'upgrade2x':case 'wUpgrade5x':return condition(upgrades.some(g=>ratio(g)>=goal));
 case 'cUpgrade15':return condition(upgrades.some(g=>g.chance_bps<=150));
 default:return null;
 }
}
const path='/api/admin/monetization/s2-observed';
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const endDate=(s:string,n:number)=>new Date(Date.parse(s)+n*86400000).toISOString().slice(0,10);
export function installObservedSeason(app:Express,db:SupabaseClient,admin:RequestHandler){
 const privateGet:RequestHandler=(_q,r,n)=>{r.set('Cache-Control','private,no-store');n()};
 app.get(path,privateGet,admin,async(q,r)=>{
  const start=String(q.query.start||''),scope=String(q.query.scope||'daily'),length=scope==='daily'?1:scope==='weekly'?7:scope==='challenge'?30:0;
  if(!length||!dateValid(start)||start<'2026-01-01'||start>'2099-01-01')return void r.status(400).json({error:'invalid_period'});
  const end=endDate(start,length),from=start+'T00:00:00+03:00',to=end+'T00:00:00+03:00';
  const {data:user,error}=await db.from('rewards_users').select('id').eq('twitch_user_id',r.locals.session.twitchUserId).maybeSingle();if(error||!user)return void r.status(503).json({error:'user_unavailable'});
  // Bounded server reads only. Refuse partial results instead of reporting false progress.
  async function rows(table:string,columns:string,key:string,dateOnly=false,secondary='id',mode:'normal'|'red'|'ttt'='normal'){
   const result=[];for(let offset=0;offset<10000;offset+=500){let query=db.from(table).select(columns);if(mode==='ttt')query=query.or('host_id.eq.'+user!.id+',guest_id.eq.'+user!.id);else query=query.eq('user_id',user!.id);if(mode==='red')query=query.or('ended_at.is.null,ended_at.gt.'+from);else query=query.gte(key,dateOnly?start:from);query=query.lt(key,dateOnly?end:to).order(key).order(secondary);const {data,error}=await query.range(offset,offset+499);if(error)throw Error('source_unavailable:'+table);result.push(...(data||[]));if(!data||data.length<500)return result}throw Error('source_limit:'+table);
  }
  try{
   const [mine,defuse,night,word,upgrade,bonus,live,primary,clan,boss,partnerBoss,xp,red,ttt]=await Promise.all([
    rows('rewards_ms_games','status,difficulty,started_at,finished_at','finished_at'),rows('rewards_defuse_games','status,difficulty,started_at,finished_at,mistakes','finished_at'),rows('rewards_nr_games','status,version,distance,tick,collected_coins,coins','finished_at'),rows('rewards_wordly_games','answer,guesses','game_day',true,'game_day'),rows('rewards_upgrades','result,chance_bps,source_value_coins,target_value_coins,extra_coins','created_at'),rows('rewards_bonus_claims','id','claimed_at'),rows('rewards_live_economy_daily','seconds,messages,broadcaster','day',true,'broadcaster'),db.from('rewards_streamers').select('twitch_broadcaster_id').eq('is_primary',true),rows('rewards_clan_members','id','joined_at'),rows('rewards_boss_hits','source,confirmed,rejected','created_at'),rows('rewards_partner_boss_hits','source,confirmed,rejected','created_at',false,'request_id'),rows('rewards_xp_history','amount,source_type','created_at'),rows('rewards_red_button_holds','started_at,ended_at','started_at',false,'request_id','red'),rows('rewards_ttt_rooms','status,guest_id,finish_reason','updated_at',false,'id','ttt')]);
   if(primary.error)throw Error('source_unavailable:rewards_streamers');const hits=[...boss,...partnerBoss] as unknown as {source:string;confirmed:boolean;rejected:boolean}[],xpRows=xp as unknown as {amount:number;source_type:string}[],holds=red as unknown as {started_at:string;ended_at:string|null}[],games=ttt as unknown as {status:string;guest_id:string|null;finish_reason:string}[];
   const d={mine,defuse,night,word,upgrade,bonus,live,primary:(primary.data||[]).map(x=>x.twitch_broadcaster_id).filter(Boolean),clan:clan.length,boss:hits.filter(h=>h.source==='free'&&h.confirmed&&!h.rejected).length,xp:sum(xpRows.filter(x=>x.amount>0&&x.source_type!=='admin_adjustment').map(x=>x.amount)),redSeconds:sum(holds.map(h=>Math.max(0,Math.min(Date.parse(to),Date.parse(h.ended_at||new Date().toISOString()))-Math.max(Date.parse(from),Date.parse(h.started_at)))/1000)),ttt:games.filter(g=>g.status==='finished'&&g.guest_id&&['line','draw','timeout','resigned'].includes(g.finish_reason)).length} as unknown as Observed;const tasks=scope==='daily'?dailyTasks.flat():scope==='weekly'?weeklyTasks:challenges;
   r.json({start,end,scope,testOnly:true,tasks:tasks.map(t=>({id:t.id,label:t.label,target:t.target,unit:t.unit,observed:observedTask(t,d)}))});
  }catch(e){r.status(503).json({error:e instanceof Error?e.message:'source_unavailable'})}
 });
 app.get('/admin/monetization/s2-observed',privateGet,admin,(_q,r)=>r.type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S2 · Фактический прогресс</title><style>body{font:15px/1.5 system-ui;background:#110c1b;color:#f5eaff;max-width:900px;margin:auto;padding:20px}a{color:#d8acff}section,article{padding:12px;background:#21182e;border:1px solid #654882;border-radius:9px;margin:8px 0}input,button,select{font:inherit;padding:8px;background:#34224b;color:white;border:1px solid #8053a4;border-radius:8px}button{cursor:pointer}strong{color:#ffdca8}</style><body><a href="/admin/monetization/s2-progress">← Тест S2</a><h1>Проверка реального прогресса</h1><p>Только администратор. Используются реальные записи твоего аккаунта. Ничего не начисляется. Не подключённые источники отмечены отдельно.</p><section><input id="start" type="date"><select id="scope"><option value="daily">День</option><option value="weekly">7 дней</option><option value="challenge">30 дней</option></select> <button id="load">Проверить</button><p id="status" role="status"></p></section><div id="tasks"></div><script src="${path}-script" defer></script></body></html>`));
 app.get(path+'-script',privateGet,admin,(_q,r)=>r.type('application/javascript').send(String.raw`(()=>{const $=id=>document.getElementById(id);$('start').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date());$('load').onclick=async()=>{ $('load').disabled=true;$('tasks').replaceChildren();try{const q=new URLSearchParams({start:$('start').value,scope:$('scope').value});const r=await fetch('${path}?'+q,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);$('status').textContent=d.start+' — '+d.end+' (не включая) · '+d.tasks.filter(t=>t.observed!==null).length+'/'+d.tasks.length+' подключено';for(const t of d.tasks){const row=document.createElement('article');row.textContent=t.label+' · '+(t.observed===null?'Источник ещё не подключён':t.observed.complete?'Выполнено':'Прогресс: '+t.observed.progress);$('tasks').append(row)}}catch(e){$('status').textContent=e.message}finally{$('load').disabled=false}}})();`));
}
