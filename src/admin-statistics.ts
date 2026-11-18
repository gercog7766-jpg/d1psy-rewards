import type {Express,RequestHandler} from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {adminStatisticsHtml,adminStatisticsJs} from './admin-statistics-ui.js';

type Player={twitch_login:string|null;twitch_display_name:string|null};
type Bid={id:number|string;user_id:string;amount:number;player:Player|null};
type Hold={request_id:string;user_id:string;started_at:string;ended_at:string|null;player:Player|null};
type QueryResult={data:unknown;error:unknown;count?:number|null};
const pageSize=25;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const person=(p:Player|null)=>({login:p?.twitch_login||'',name:p?.twitch_display_name||p?.twitch_login||'Удалённый пользователь'});

async function read<T>(query:PromiseLike<QueryResult>){
 const {data,error,count}=await query;
 if(error)throw error;
 return {rows:(data||[]) as T[],total:count??0};
}

// Read every participant in a round, including histories longer than the API page limit.
async function readRound<T>(query:(start:number,end:number)=>PromiseLike<QueryResult>){
 const first=await read<T>(query(0,499));
 const rows=first.rows;
 for(let start=500;start<first.total;start+=500){
  const next=await read<T>(query(start,Math.min(start+499,first.total-1)));
  rows.push(...next.rows);
 }
 return rows;
}

export function summarizeBids(bids:Bid[],round:{winner_id:string|null;high_bid:number|null;closed_at:string|null}){
 const players=new Map<string,{userId:string;login:string;name:string;bids:number;highest:number;spent:number;reserved:number;won:boolean}>();
 for(const bid of bids){
  let row=players.get(bid.user_id);
  if(!row){row={userId:bid.user_id,...person(bid.player),bids:0,highest:0,spent:0,reserved:0,won:false};players.set(bid.user_id,row)}
  row.bids++;
  row.highest=Math.max(row.highest,Number(bid.amount));
 }
 const leader=round.winner_id&&players.get(round.winner_id);
 if(leader){
  if(round.closed_at){leader.spent=Number(round.high_bid||0);leader.won=true}
  else leader.reserved=Number(round.high_bid||0);
 }
 return [...players.values()].sort((a,b)=>b.highest-a.highest||a.userId.localeCompare(b.userId));
}

export function summarizeHolds(holds:Hold[],endsAt:string,asOf:string){
 const cutoff=Math.min(Date.parse(endsAt),Date.parse(asOf));
 const totals=new Map<string,{userId:string;login:string;name:string;presses:number;totalMs:number;bestMs:number}>();
 const history=holds.map(hold=>{
  const end=Math.min(hold.ended_at?Date.parse(hold.ended_at):cutoff,cutoff);
  const durationMs=Math.max(0,end-Date.parse(hold.started_at));
  let player=totals.get(hold.user_id);
  if(!player){player={userId:hold.user_id,...person(hold.player),presses:0,totalMs:0,bestMs:0};totals.set(hold.user_id,player)}
  player.presses++;player.totalMs+=durationMs;player.bestMs=Math.max(player.bestMs,durationMs);
  return {...person(hold.player),startedAt:hold.started_at,endedAt:hold.ended_at,durationMs};
 });
 return {players:[...totals.values()].sort((a,b)=>b.totalMs-a.totalMs||a.userId.localeCompare(b.userId)),history};
}

export function installAdminStatistics(app:Express,db:SupabaseClient,admin:RequestHandler){
 const noStore:RequestHandler=(_q,r,next)=>{r.set('Cache-Control','private, no-store');next()};
 app.use((q,r,next)=>{
  if(q.path==='/admin'){
   const send=r.send.bind(r);
   r.send=function(body){
    if(typeof body==='string'&&!body.includes('id="adminStatisticsLink"')){
     body=body.replace(/(<div\b[^>]*class="tabs"[^>]*>)/,'$1<a id="adminStatisticsLink" href="/admin/statistics" style="padding:10px 14px;border:1px solid #70428f;border-radius:10px;color:#f2e6fc;text-decoration:none">Статистика</a>');
    }
    return send(body);
   };
  }
  next();
 });
 app.get('/admin/statistics',noStore,admin,(_q,r)=>r.send(adminStatisticsHtml));
 app.get('/admin/statistics.js',noStore,admin,(_q,r)=>r.type('application/javascript').send(adminStatisticsJs));
 app.get('/api/admin/statistics/:kind',noStore,admin,async(q,r)=>{
  const {kind}=q.params;
  const {page='1',sort='value',result='won',from='',to='',round}=q.query;
  if(typeof kind!=='string'||!['upgrades','black-box','red-button'].includes(kind)||typeof page!=='string'||!/^\d{1,6}$/.test(page)||Number(page)<1
   ||typeof from!=='string'||typeof to!=='string'||[from,to].some(x=>x&&(!/^\d{4}-\d{2}-\d{2}T/.test(x)||!Number.isFinite(Date.parse(x))))
   ||from&&to&&Date.parse(from)>=Date.parse(to)||round!==undefined&&(typeof round!=='string'||!uuid.test(round))){
   r.status(400).json({error:'invalid_filters'});return;
  }
  const start=(Number(page)-1)*pageSize;
  try{
   if(kind==='upgrades'){
    if(typeof sort!=='string'||!['value','chance','recent'].includes(sort)||typeof result!=='string'||!['won','lost','all'].includes(result)){
     r.status(400).json({error:'invalid_filters'});return;
    }
    let query=db.from('rewards_upgrades').select('id,created_at,source_name,target_name,source_value_coins,target_value_coins,extra_coins,chance_bps,result,player:rewards_users!user_id(twitch_login,twitch_display_name)',{count:'exact'});
    if(result!=='all')query=query.eq('result',result);
    if(from)query=query.gte('created_at',from);
    if(to)query=query.lt('created_at',to);
    query=sort==='chance'?query.order('chance_bps',{ascending:true}):sort==='value'?query.order('target_value_coins',{ascending:false}):query.order('created_at',{ascending:false});
    const data=await read(query.order('id').range(start,start+pageSize-1));
    r.json({...data,page:Number(page),pageSize});return;
   }
   const button=kind==='red-button';
   const table=button?'rewards_red_button_rounds':'rewards_black_boxes';
   let query=db.from(table).select(button
    ?'id,day,starts_at,ends_at,closed_at,prize_name,wear,price,winner,win_id,winning_ms'
    :'id,starts_at,ends_at,closed_at,prize_name,prize_coins,high_bid,winner_id',{count:'exact'});
   if(from)query=query.gte('starts_at',from);
   if(to)query=query.lt('starts_at',to);
   if(round)query=query.eq('id',round);
   const list=await read<Record<string,unknown>>(query.order('starts_at',{ascending:false}).order('id').range(start,start+pageSize-1));
   if(!round){r.json({...list,page:Number(page),pageSize});return}
   const selected=list.rows[0];
   if(!selected){r.status(404).json({error:'round_not_found'});return}
   const asOf=new Date().toISOString();
   if(button){
    const holds=await readRound<Hold>((begin,end)=>db.from('rewards_red_button_holds')
     .select('request_id,user_id,started_at,ended_at,player:rewards_users!user_id(twitch_login,twitch_display_name)',{count:'exact'})
     .eq('round_id',round).lte('started_at',asOf).order('started_at').order('request_id').range(begin,end));
    r.json({round:selected,asOf,...summarizeHolds(holds,String(selected.ends_at),asOf)});
   }else{
    const bids=await readRound<Bid>((begin,end)=>db.from('rewards_black_box_bids')
     .select('id,user_id,amount,player:rewards_users!user_id(twitch_login,twitch_display_name)',{count:'exact'})
     .eq('box_id',round).order('id').range(begin,end));
    r.json({round:selected,asOf,players:summarizeBids(bids,selected as {winner_id:string|null;high_bid:number|null;closed_at:string|null}),
     history:bids.map(b=>({...person(b.player),amount:b.amount}))});
   }
  }catch(error){
   console.error('admin_statistics_failed',kind,(error as {code?:string})?.code||'unknown');
   r.status(503).json({error:'statistics_unavailable'});
  }
 });
}
