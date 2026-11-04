import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
const expected='d1psy_multistream_test_db',url=process.env.DATABASE_URL;
if(process.env.ISOLATED_TEST_API!=='true'||process.env.VERIFY_ATOMIC_CHAT!=='true'||!url||new URL(url).pathname.slice(1)!==expected)throw Error('Isolated DB guard');
const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000}),client=await pool.connect();
const primary='00000000-0000-4000-8000-000000000001',secondary='00000000-0000-4000-8000-000000000002';
let begun=false;
try{
 await client.query('BEGIN');begun=true;
 const {rows:[db]}=await client.query('select current_database() as name');if(db.name!==expected)throw Error('Wrong DB');
 await client.query(`
 alter table public.rewards_streamers add column twitch_broadcaster_id text;
 update public.rewards_streamers set twitch_broadcaster_id=case when is_primary then '511100980' else '39780903' end;
 alter table public.rewards_rounds add column message_count integer not null default 0;
 create table public.rewards_event_dedup(event_id text primary key,event_type text not null);
 create table public.rewards_chat_events(twitch_event_id text,streamer_id uuid,round_id uuid,twitch_user_id text,occurred_at timestamptz);
 create function public.rewards_record_chat_message(p_round_id uuid,p_twitch_user_id text)
 returns void language plpgsql as $f$
 begin
   if p_twitch_user_id='force-error' then raise exception 'injected_failure'; end if;
   update public.rewards_rounds set message_count=message_count+1 where id=p_round_id;
 end $f$;
 `);
 await client.query(readFileSync('migrations/20261104_atomic_chat_proposal.sql','utf8'));
 const record=(s,b,id,u)=>client.query('select public.rewards_streamer_record_chat_atomic($1,$2,$3,$4,now()) as recorded',[s,b,id,u]);
 if(!(await record(secondary,'39780903','delivery-1','viewer-a')).rows[0].recorded)throw Error('First event failed');
 if((await record(secondary,'39780903','delivery-1','viewer-a')).rows[0].recorded)throw Error('Duplicate counted');
 if(!(await record(primary,'511100980','delivery-1','viewer-a')).rows[0].recorded)throw Error('Cross-streamer collision');
 const counts=await client.query("select message_count from public.rewards_rounds where status='active'");
 if(counts.rows.length!==2||counts.rows.some(x=>x.message_count!==1))throw Error('Cross-streamer count mismatch');
 await client.query('SAVEPOINT mismatch');
 try{await record(secondary,'511100980','delivery-2','viewer-a');throw Error('Mismatched broadcaster accepted');}
 catch(e){if(!String(e.message).includes('streamer_broadcaster_mismatch'))throw e;await client.query('ROLLBACK TO SAVEPOINT mismatch');}
 await client.query('SAVEPOINT failed_increment');
 try{await record(secondary,'39780903','retry-event','force-error');throw Error('Injected error did not fail');}
 catch(e){if(!String(e.message).includes('injected_failure'))throw e;await client.query('ROLLBACK TO SAVEPOINT failed_increment');}
 const {rows:[afterFailure]}=await client.query("select (select count(*)::int from public.rewards_event_dedup where event_id='39780903:retry-event') as dedup,(select count(*)::int from public.rewards_chat_events where twitch_event_id='retry-event') as events,(select message_count from public.rewards_rounds where streamer_id=$1 and status='active') as count",[secondary]);
 if(afterFailure.dedup!==0||afterFailure.events!==0||afterFailure.count!==1)throw Error('Failed transaction left partial writes '+JSON.stringify(afterFailure));
 if(!(await record(secondary,'39780903','retry-event','viewer-b')).rows[0].recorded)throw Error('Failed event could not retry');
 const {rows:[check]}=await client.query("select (select count(*)::int from public.rewards_event_dedup) as dedup,(select count(*)::int from public.rewards_chat_events) as events,(select message_count from public.rewards_rounds where streamer_id=$1 and status='active') as secondary_count",[secondary]);
 if(check.dedup!==3||check.events!==3||check.secondary_count!==2)throw Error('Atomic accounting mismatch '+JSON.stringify(check));
 // An event without an active round is still recorded once, but cannot credit a round.
 await client.query("update public.rewards_rounds set status='cancelled' where streamer_id=$1 and status='active'",[secondary]);
 if(!(await record(secondary,'39780903','between-rounds','viewer-c')).rows[0].recorded)throw Error('Between-round event not stored');
 if((await record(secondary,'39780903','between-rounds','viewer-c')).rows[0].recorded)throw Error('Between-round duplicate counted');
 const {rows:[gap]}=await client.query("select (select count(*)::int from public.rewards_chat_events where streamer_id=$1 and round_id is null) as unassigned,(select message_count from public.rewards_rounds where streamer_id=$1) as count",[secondary]);
 if(gap.unassigned!==1||gap.count!==2)throw Error('Between-round event affected counter');
 console.log('PASS: isolated atomic chat duplicate, cross-streamer, mismatch, retry, no-round and rollback');
}catch(e){console.error('FAIL: atomic chat:',e.message);process.exitCode=1;}
finally{if(begun)await client.query('ROLLBACK');client.release();await pool.end();}
