import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
test('free online tic-tac-toe: privacy, joins, turns, win/draw, timeouts and permissions',async()=>{
 const db=new PGlite();const u=[1,2,3,4].map(i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
 const call=async(name,args)=>{const keys=Object.keys(args);return(await db.query(`select public.rewards_ttt_${name}(${keys.map((k,i)=>k+'=> $'+(i+1)).join(',')}) as result`,Object.values(args))).rows[0].result};
 const state=(i,room=null)=>call('state',{p_user:u[i],p_room:room});
 const create=(i,id,hash=null)=>call('create',{p_user:u[i],p_room:id,p_password_hash:hash});
 const join=(i,id,hash=null,hostX=true)=>call('join',{p_user:u[i],p_room:id,p_password_hash:hash,p_host_x:hostX});
 const move=async(i,id,cell,revision)=>{if(revision===undefined)revision=(await state(i,id)).room.revision;return call('move',{p_user:u[i],p_room:id,p_cell:cell,p_revision:revision})};
 const leave=(i,id)=>call('leave',{p_user:u[i],p_room:id});
 try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.rewards_users(id uuid primary key,twitch_login text,twitch_display_name text);grant select,update on public.rewards_users to service_role;create table public.rewards_coin_transactions(id uuid,amount integer);');
 for(let i=0;i<u.length;i++)await db.query('insert into public.rewards_users values($1,$2,$2)',[u[i],'Player'+i]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261105223516_tic_tac_toe_rooms.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261106194825_tic_tac_toe_five_by_five.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261106200621_tic_tac_toe_four_in_a_row.sql',import.meta.url),'utf8'));await db.exec('set role service_role');
 const pub=randomUUID();await create(0,pub);await create(0,pub);assert.equal((await state(1)).rooms.length,1);
 await assert.rejects(create(0,randomUUID()),/already_in_room/);
 await join(0,pub);assert.equal((await state(0,pub)).room.status,'waiting');
 const joined=await Promise.allSettled([join(1,pub),join(2,pub)]);assert.equal(joined.filter(r=>r.status==='fulfilled').length,1);
 const guest=joined[0].status==='fulfilled'?1:2,outsider=guest===1?2:1;
 let r=(await state(0,pub)).room;assert.equal(r.myMark,'X');assert.equal((await state(guest,pub)).room.myMark,'O');assert.equal(r.opponentName,'Player'+guest);
 await assert.rejects(move(outsider,pub,0,r.revision),/not_participant/);await assert.rejects(move(guest,pub,0),/not_your_turn/);
 const old=r.revision;await move(0,pub,0);await assert.rejects(move(0,pub,1,old),/stale_move/);await assert.rejects(move(guest,pub,0),/invalid_cell/);
 await move(guest,pub,3);await move(0,pub,1);await move(guest,pub,4);await move(0,pub,2);
 r=(await state(0,pub)).room;assert.equal(r.status,'finished');assert.equal(r.reason,'line');assert(r.won);await assert.rejects(move(guest,pub,5),/game_finished/);
 const priv=randomUUID(),hash='a'.repeat(64);await create(0,priv,hash);
 assert(!(await state(outsider)).rooms.some(x=>x.id===priv));const preview=(await state(outsider,priv)).room;assert.equal(preview.board,null);assert(!JSON.stringify(preview).includes(hash));
 await assert.rejects(join(guest,priv,'b'.repeat(64)),/wrong_password/);await join(guest,priv,hash,false);assert.equal((await state(guest,priv)).room.myMark,'X');
 // Nine-move draw: X O X / X O O / O X X.
 const sequence=[0,1,2,4,3,5,7,6,8];for(let i=0;i<sequence.length;i++)await move(i%2===0?guest:0,priv,sequence[i]);
 r=(await state(0,priv)).room;assert.equal(r.status,'finished');assert.equal(r.reason,'draw');assert(!r.won);
 const timeout=randomUUID();await create(0,timeout);await join(guest,timeout);
 await db.exec("reset role;update public.rewards_ttt_rooms set turn_deadline=clock_timestamp()-interval '1 second' where id='"+timeout+"';set role service_role");
 await assert.rejects(move(0,timeout,0),/game_finished/);r=(await state(guest,timeout)).room;assert.equal(r.reason,'timeout');assert(r.won);
 const cancel=randomUUID();await create(0,cancel);await leave(0,cancel);assert.equal((await state(0,cancel)).room.status,'cancelled');
 const resign=randomUUID();await create(0,resign);await join(guest,resign);await leave(0,resign);await leave(0,resign);assert((await state(guest,resign)).room.won);assert.equal((await state(0,resign)).room.reason,'resigned');
 const expire=randomUUID();await create(0,expire);await db.exec("reset role;update public.rewards_ttt_rooms set expires_at=clock_timestamp()-interval '1 second' where id='"+expire+"';set role service_role");
 assert.equal((await state(0,expire)).room.reason,'expired');assert.equal((await state(0)).currentRoomId,null);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(state(0),/permission denied/);await assert.rejects(db.query('select * from public.rewards_ttt_rooms'),/permission denied/)}
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from public.rewards_coin_transactions')).rows[0].n,0);
 }finally{await db.close()}
});

