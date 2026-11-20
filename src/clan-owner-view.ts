import type {SupabaseClient} from '@supabase/supabase-js';

// The same immutable primary-channel identity used by owner-only Dropso Connect.
export async function isClanSiteOwner(db:SupabaseClient,actor:string){
 const {data,error}=await db.from('rewards_streamers').select('twitch_broadcaster_id').eq('is_primary',true).eq('enabled',true).maybeSingle();
 if(error)throw Error('owner_lookup_failed');
 return data?.twitch_broadcaster_id===actor;
}

function read<T>(result:{data:T;error:unknown}):T{if(result.error)throw Error('clan_unavailable');return result.data}
const dateAdd=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const login=(row:any)=>row.rewards_users?.twitch_login||'Игрок';

// Called only after the signed admin session and primary-owner identity are verified.
// No membership, balance, player action or task-processing RPC is invoked here.
export async function readClanOwnerView(db:SupabaseClient,id:string){
 const clan=read(await db.from('rewards_clans').select('id,name,avatar,owner_id,cxp,treasury,extra_slot,min_level,min_bp,decorations,created_at').eq('id',id).maybeSingle());
 if(!clan)return null;
 const period=read(await db.rpc('rewards_clan_period',{p_at:new Date().toISOString()}));
 const end=period==='2026-11-20'?'2026-11-30':dateAdd(period,7),from=period+'T00:00:00+03:00',until=end+'T00:00:00+03:00';
 const [level,capacity,members,requests,tasks,awards,chat,ledger]=await Promise.all([
  db.rpc('rewards_clan_level',{p_xp:clan.cxp}),db.rpc('rewards_clan_capacity',{p_xp:clan.cxp,p_extra:clan.extra_slot}),
  db.from('rewards_clan_members').select('user_id,joined_at,rewards_users(twitch_login)').eq('clan_id',id).is('left_at',null).order('joined_at'),
  db.from('rewards_clan_requests').select('user_id,created_at,rewards_users(twitch_login)').eq('clan_id',id).order('created_at'),
  db.from('rewards_clan_tasks').select('source,label,target,cxp').eq('period',period).order('source'),
  db.from('rewards_clan_task_awards').select('source').eq('clan_id',id).eq('period',period),
  db.from('rewards_clan_chat').select('message,created_at,rewards_users(twitch_login)').eq('clan_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(60),
  db.from('rewards_clan_ledger').select('amount,kind,created_at,rewards_users(twitch_login)').eq('clan_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30)
 ]);
 const progress=new Map<string,number>();
 // PostgREST caps individual responses; aggregate every page of receipts, not merely the first 1000.
 for(let offset=0;;offset+=500){const rows=read(await db.from('rewards_clan_events').select('source,event_key,amount').eq('clan_id',id).gte('occurred_at',from).lt('occurred_at',until).order('source').order('event_key').range(offset,offset+499))||[];for(const row of rows)progress.set(row.source,(progress.get(row.source)||0)+Number(row.amount));if(rows.length<500)break}
 const done=new Set((read(awards)||[]).map((a:any)=>a.source));
 let cp:number|undefined,streamCp:number|undefined;try{const now=new Date().toISOString(),start=read(await db.rpc('rewards_clan_season_start',{p_at:now}));const scores=read(await db.rpc('rewards_clan_cp_scores',{p_start:start,p_until:now,p_clan:id}));if(Array.isArray(scores)&&scores[0]){cp=Number(scores[0].cp);streamCp=Math.max(0,cp-Number(scores[0].base_cp)-Number(scores[0].bonus_cp))}}catch{/* Older deployments may not yet have seasonal CP. */}
 return {id:clan.id,name:clan.name,avatar:clan.avatar,level:read(level),capacity:read(capacity),cxp:clan.cxp,cp,streamCp,treasury:clan.treasury,extraSlot:clan.extra_slot,minLevel:clan.min_level,minBp:clan.min_bp,period,ends:end,createdAt:clan.created_at,decorations:clan.decorations,
  members:(read(members)||[]).map((m:any)=>({login:login(m),owner:m.user_id===clan.owner_id,joinedAt:m.joined_at})),
  requests:(read(requests)||[]).map((r:any)=>({login:login(r),created_at:r.created_at})),
  tasks:(read(tasks)||[]).map((t:any)=>({...t,progress:progress.get(t.source)||0,done:done.has(t.source)})),
  chat:(read(chat)||[]).map((r:any)=>({login:login(r),message:r.message,created_at:r.created_at})).reverse(),
  ledger:(read(ledger)||[]).map((r:any)=>({login:r.rewards_users?.twitch_login||null,amount:r.amount,kind:r.kind,created_at:r.created_at}))};
}
