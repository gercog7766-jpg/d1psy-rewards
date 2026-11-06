import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
test('game XP and future Battle Pass dailies: once per win/day, correct prediction and preserved current schedule',async()=>{
 const db=new PGlite();const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 const file=async p=>readFile(new URL(p,import.meta.url),'utf8');
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.rewards_users(id uuid primary key,twitch_login text,twitch_display_name text,xp_total integer not null default 0,updated_at timestamptz default now());
 create table public.rewards_coin_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,transaction_type text,note text);
 create table public.rewards_xp_history(id uuid primary key default gen_random_uuid(),user_id uuid,amount integer,reason text,source_type text,source_id text,created_at timestamptz default now(),unique(user_id,source_type,source_id));
 create table public.rewards_season_daily_schedule(day date,task_key text,target integer,reward integer,primary key(day,task_key));
 create table public.rewards_season_task_progress(user_id uuid,season_id text,task_key text,period_key text,progress integer,completed_at timestamptz,sp_awarded integer,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(user_id,season_id,task_key,period_key));
 create table public.rewards_season_progress(user_id uuid,season_id text,sp integer,claimed_levels integer[],created_at timestamptz default now(),updated_at timestamptz default now(),primary key(user_id,season_id));
 create table public.test_bp_clock(value timestamptz);insert into public.test_bp_clock values('2026-11-06 12:00:00+03');
 create function public.test_bp_now() returns timestamptz language sql stable as $$select value from public.test_bp_clock$$;
 create function public.rewards_s1_day() returns text language sql stable as $$select to_char(public.test_bp_now() at time zone 'Europe/Moscow','YYYY-MM-DD')$$;
 grant select,insert,update on all tables in schema public to service_role;grant delete on public.rewards_season_daily_schedule to service_role;
 insert into public.rewards_season_daily_schedule values('2026-11-06','xp_100',100,150),('2026-11-06','upgrade_win',1,200),('2026-11-06','upgrades_2',2,150);`);
 await db.query('insert into public.rewards_users(id,twitch_login,twitch_display_name) values($1,$3,$3),($2,$4,$4)',[a,b,'Host','Guest']);
 await db.exec(await file('./fixtures/game-bp-existing.sql'));
 for(const name of ['20261105201910_games_wordly.sql','20261105203147_wordly_win_reward.sql','20261105213416_predict_matches.sql','20261105223516_tic_tac_toe_rooms.sql'])await db.exec(await file('../supabase/migrations/'+name));
 // Fix only the schedule-generation clock in the isolated fixture; runtime room clocks stay real.
 const migration=(await file('../supabase/migrations/20261105225435_game_xp_battle_pass.sql')).replace("(now() at time zone 'Europe/Moscow')::date+1", "(public.test_bp_now() at time zone 'Europe/Moscow')::date+1");
 await db.exec(migration);
 const rows=async(q,args=[]) => (await db.query(q,args)).rows;
 assert.deepEqual((await rows("select task_key from public.rewards_season_daily_schedule where day='2026-11-06' order by task_key")).map(x=>x.task_key),['upgrade_win','upgrades_2','xp_100']);
 assert.deepEqual((await rows("select task_key,reward from public.rewards_season_daily_schedule where day='2026-11-07' order by task_key")).map(x=>[x.task_key,x.reward]),[['predict_winner',150],['ttt_win',150],['wordly_win',150]]);
 assert.equal((await rows("select count(*)::int as n from (select day from public.rewards_season_daily_schedule where day between '2026-11-07' and '2026-12-12' group by day having count(*)<>3)t"))[0].n,0);
 assert.equal((await rows("select count(*)::int as n from public.rewards_season_daily_schedule where extract(isodow from day)=7 and task_key='drop_win'"))[0].n,0);
 const ttt=async(name,args)=>{const keys=Object.keys(args);return(await rows(`select public.rewards_ttt_${name}(${keys.map((k,i)=>k+'=> $'+(i+1)).join(',')}) as r`,Object.values(args)))[0].r};
 await db.exec('set role service_role');
 async function win(){const id=randomUUID();await ttt('create',{p_user:a,p_room:id,p_password_hash:null});await ttt('join',{p_user:b,p_room:id,p_password_hash:null,p_host_x:true});let rev=1;for(const [user,cell]of[[a,0],[b,3],[a,1],[b,4],[a,2]])await ttt('move',{p_user:user,p_room:id,p_cell:cell,p_revision:rev++});return id}
 const before=await win();assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,10);assert.equal((await rows("select count(*)::int as n from public.rewards_season_task_progress where task_key='ttt_win'"))[0].n,0);
 await db.exec("update public.test_bp_clock set value='2026-11-07 12:00:00+03'");
 const id=await win();await ttt('leave',{p_user:a,p_room:id});await ttt('state',{p_user:a,p_room:id});await win();
 assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,30);
 assert.equal((await rows("select count(*)::int as n from public.rewards_xp_history where user_id=$1 and source_type='tic_tac_toe_win'",[a]))[0].n,3);
 assert.equal((await rows("select sp from public.rewards_season_progress where user_id=$1",[a]))[0].sp,150);
 const day=(await rows("select ((clock_timestamp() at time zone 'Europe/Moscow')::date)::text as d"))[0].d;
 const guessId=randomUUID();const guess=(word,request=guessId)=>db.query('select public.rewards_wordly_guess($1,$2,$3,$4,$5)',[a,day,word,request,'лампа']);
 await guess('банан',randomUUID());assert.equal((await rows("select sp from public.rewards_season_progress where user_id=$1",[a]))[0].sp,150);
 await guess('лампа');await guess('лампа');assert.equal((await rows("select sp from public.rewards_season_progress where user_id=$1",[a]))[0].sp,300);
 await db.exec("insert into public.rewards_predict_matches(id,starts_at,team_a,team_b,logo_a,logo_b,roster_a,roster_b) select 'bp-test',clock_timestamp()+interval '1 hour',team_a,team_b,logo_a,logo_b,roster_a,roster_b from public.rewards_predict_matches where id='2026-11-06-parivision-navi'");
 await db.query("select public.rewards_save_prediction($1,'bp-test','a','2:1','b1t')",[a]);await db.query("select public.rewards_save_prediction($1,'bp-test','b','2:0','Jame')",[b]);
 await db.exec("update public.rewards_predict_matches set starts_at=clock_timestamp()-interval '1 minute' where id='bp-test'");
 await db.query("select public.rewards_settle_predictions('bp-test','a','2:0',array['Jame'])");await db.query("select public.rewards_settle_predictions('bp-test','a','2:0',array['Jame'])");
 assert.equal((await rows("select sp from public.rewards_season_progress where user_id=$1",[a]))[0].sp,450);
 assert.equal((await rows("select count(*)::int as n from public.rewards_season_task_progress where user_id=$1 and task_key='predict_winner'",[b]))[0].n,0);
 assert((await rows("select task_key,progress,sp_awarded from public.rewards_season_task_progress where user_id=$1 and period_key='2026-11-07'",[a])).every(x=>x.progress===1&&x.sp_awarded===150));
 // Apply the cap with existing XP already earned on this real Moscow day.
 await db.exec('reset role');await db.exec(await file('../supabase/migrations/20261106000905_tic_tac_toe_daily_xp_cap.sql'));await db.exec('set role service_role');
 await win();await win();assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,30);
 // At the XP ceiling, a newly available BP win still completes normally.
 await db.exec("reset role;delete from public.rewards_season_task_progress where task_key='ttt_win';update public.rewards_season_progress set sp=sp-150;set role service_role");
 await win();assert.equal((await rows('select sp from public.rewards_season_progress where user_id=$1',[a]))[0].sp,450);
 assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,30);
 // Move the previous game's XP to yesterday to verify a fresh Moscow-day quota.
 await db.exec("update public.rewards_xp_history set created_at=created_at-interval '24 hours' where source_type='tic_tac_toe_win'");
 await db.query("select * from public.rewards_award_xp($1,100,'Other XP','admin_adjustment',$2)",[a,randomUUID()]);
 const drawId=randomUUID();await ttt('create',{p_user:a,p_room:drawId,p_password_hash:null});await ttt('join',{p_user:b,p_room:drawId,p_password_hash:null,p_host_x:true});
 let rev=1;for(const [i,cell]of[0,1,2,4,3,5,7,6,8].entries())await ttt('move',{p_user:i%2===0?a:b,p_room:drawId,p_cell:cell,p_revision:rev++});
 assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,130);
 for(let i=0;i<5;i++)await win();
 assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[a]))[0].xp_total,160);
 const quota=(await rows("select sum(amount)::int as xp,count(*)::int as n from public.rewards_xp_history where user_id=$1 and source_type='tic_tac_toe_win' and created_at>=((now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow')",[a]))[0];assert.equal(quota.xp,30);assert.equal(quota.n,3);
 // Exact Moscow midnight boundary: 23:59:59 belongs to yesterday, 00:00:00 to today.
 await db.query("insert into public.rewards_xp_history(user_id,amount,reason,source_type,source_id,created_at) values($1,30,'Past day','tic_tac_toe_win',$2,((now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow')-interval '1 second')",[b,randomUUID()]);
 await db.query('update public.rewards_users set xp_total=30 where id=$1',[b]);
 async function guestWin(){const id=randomUUID();await ttt('create',{p_user:b,p_room:id,p_password_hash:null});await ttt('join',{p_user:a,p_room:id,p_password_hash:null,p_host_x:true});let rev=1;for(const[user,cell]of[[b,0],[a,3],[b,1],[a,4],[b,2]])await ttt('move',{p_user:user,p_room:id,p_cell:cell,p_revision:rev++})}
 await guestWin();assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[b]))[0].xp_total,40);
 await db.query("insert into public.rewards_xp_history(user_id,amount,reason,source_type,source_id,created_at) values($1,20,'Midnight','tic_tac_toe_win',$2,((now() at time zone 'Europe/Moscow')::date::timestamp at time zone 'Europe/Moscow'))",[b,randomUUID()]);
 await db.query('update public.rewards_users set xp_total=xp_total+20 where id=$1',[b]);await guestWin();assert.equal((await rows('select xp_total from public.rewards_users where id=$1',[b]))[0].xp_total,60);
 // Re-seeding tomorrow cannot rewrite current tasks or duplicate the future three.
 await db.exec('select public.rewards_s1_seed_daily_schedule()');assert.equal((await rows("select count(*)::int as n from public.rewards_season_daily_schedule where day='2026-11-07'"))[0].n,3);
 }finally{await db.close()}
});
