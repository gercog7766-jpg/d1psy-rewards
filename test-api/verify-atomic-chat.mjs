import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import http from 'node:http';
import { once } from 'node:events';
import { acknowledgeChat } from '../src/eventsub-ack.mjs';
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
 // End-to-end HTTP acknowledgment against the actual SQL RPC in this transaction.
 // This is a synthetic webhook transport, not a live Twitch signature test.
 let sequence=0;
 const server=http.createServer((req,res)=>{
   if(req.method!=='POST'||req.url!=='/eventsub/twitch'){res.writeHead(404).end();return;}
   const messageId=String(req.headers['x-test-message-id']||'');
   const chatterId=String(req.headers['x-test-chatter-id']||'viewer-http');
   void acknowledgeChat({
     atomicEnabled:true,
     route:async()=>{
       const savepoint='http_event_'+(++sequence);
       await client.query('SAVEPOINT '+savepoint);
       try{
         await record(primary,'511100980',messageId,chatterId);
         await client.query('RELEASE SAVEPOINT '+savepoint);
       }catch(error){
         await client.query('ROLLBACK TO SAVEPOINT '+savepoint);
         await client.query('RELEASE SAVEPOINT '+savepoint);
         throw error;
       }
     },
     sendStatus:status=>res.writeHead(status).end(),
     onLegacyError:()=>{}
   });
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
   const port=server.address().port;
   const send=(id,user)=>fetch('http://127.0.0.1:'+port+'/eventsub/twitch',{
     method:'POST',headers:{'x-test-message-id':id,'x-test-chatter-id':user}
   }).then(response=>response.status);
   if(await send('http-delivery','viewer-http')!==204)throw Error('HTTP atomic delivery was not acknowledged');
   if(await send('http-delivery','viewer-http')!==204)throw Error('HTTP duplicate was not acknowledged');
   const originalError=console.error;console.error=()=>{};
   let failedStatus;
   try{failedStatus=await send('http-failure','force-error');}finally{console.error=originalError;}
   if(failedStatus!==500)throw Error('HTTP failed transaction was acknowledged');
   if(await send('http-failure','viewer-retry')!==204)throw Error('HTTP retry was not acknowledged');
   const {rows:[httpCheck]}=await client.query("select (select count(*)::int from public.rewards_event_dedup where event_id='511100980:http-delivery') as once_only,(select count(*)::int from public.rewards_event_dedup where event_id='511100980:http-failure') as retried,(select message_count from public.rewards_rounds where streamer_id=$1 and status='active') as count",[primary]);
   if(httpCheck.once_only!==1||httpCheck.retried!==1||httpCheck.count!==3)throw Error('HTTP/SQL accounting mismatch '+JSON.stringify(httpCheck));
 }finally{
   server.closeAllConnections();
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
 // Two independent synthetic chat streams must never advance each other's active round.
 const {rows:isolatedRounds}=await client.query(
  "select streamer_id, message_count, status from public.rewards_rounds where streamer_id in ($1,$2) and status='active' order by streamer_id",
  [primary,secondary]
 );
 const byStreamer=new Map(isolatedRounds.map(r=>[r.streamer_id,r.message_count]));
 if(byStreamer.size!==2||byStreamer.get(primary)!==3||byStreamer.get(secondary)!==2)
   throw Error('Independent stream round counters diverged '+JSON.stringify(isolatedRounds));
 // Simulate another secondary chat notification. Primary's round must remain unchanged.
 if(!(await record(secondary,'39780903','secondary-only-after-primary','viewer-secondary')))
   throw Error('Secondary synthetic notification was rejected');
 const {rows:[afterSecondary]}=await client.query(
  "select (select message_count from public.rewards_rounds where streamer_id=$1 and status='active') as primary_count,(select message_count from public.rewards_rounds where streamer_id=$2 and status='active') as secondary_count",
  [primary,secondary]
 );
 if(afterSecondary.primary_count!==3||afterSecondary.secondary_count!==3)
   throw Error('Cross-stream chat leakage '+JSON.stringify(afterSecondary));
 // Simulate a primary-only notification and verify the inverse isolation.
 if(!(await record(primary,'511100980','primary-only-after-secondary','viewer-primary')))
   throw Error('Primary synthetic notification was rejected');
 const {rows:[afterPrimary]}=await client.query(
  "select (select message_count from public.rewards_rounds where streamer_id=$1 and status='active') as primary_count,(select message_count from public.rewards_rounds where streamer_id=$2 and status='active') as secondary_count",
  [primary,secondary]
 );
 if(afterPrimary.primary_count!==4||afterPrimary.secondary_count!==3)
   throw Error('Cross-stream chat leakage after primary event '+JSON.stringify(afterPrimary));
 console.log('PASS: two independent streamer rounds: primary 4, amych 3; dedup and cross-stream isolation');
 // An event without an active round is still recorded once, but cannot credit a round.
 await client.query("update public.rewards_rounds set status='cancelled' where streamer_id=$1 and status='active'",[secondary]);
 if(!(await record(secondary,'39780903','between-rounds','viewer-c')).rows[0].recorded)throw Error('Between-round event not stored');
 if((await record(secondary,'39780903','between-rounds','viewer-c')).rows[0].recorded)throw Error('Between-round duplicate counted');
 const {rows:[gap]}=await client.query("select (select count(*)::int from public.rewards_chat_events where streamer_id=$1 and round_id is null) as unassigned,(select message_count from public.rewards_rounds where streamer_id=$1) as count",[secondary]);
 if(gap.unassigned!==1||gap.count!==2)throw Error('Between-round event affected counter');
 console.log('PASS: isolated atomic chat SQL and HTTP 204/500 duplicate/retry, cross-streamer, no-round and rollback');
}catch(e){console.error('FAIL: atomic chat:',e.message);process.exitCode=1;}
finally{if(begun)await client.query('ROLLBACK');client.release();await pool.end();}
