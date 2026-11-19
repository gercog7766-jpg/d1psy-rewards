import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { JSDOM } from 'jsdom';
import { redButtonPage, redButtonScript } from '../src/red-button-ui.ts';

test('red button charges once per day, hides holds and settles the sum of holds once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table rewards_users(id uuid primary key default gen_random_uuid(), twitch_user_id text unique, twitch_login text, twitch_display_name text, banned boolean default false, participation_restricted boolean default false);
      create table rewards_shop_items(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, stock integer);
      create table rewards_shop_item_variants(shop_item_id uuid, variant_kind text, wear text, price_coins integer, available boolean);
      create table rewards_prizes(id uuid primary key default gen_random_uuid(), name text, image_url text, status text, unlimited boolean, draw_weight integer, sell_price_coins integer);
      create table rewards_wins(id uuid primary key default gen_random_uuid(), user_id uuid, prize_id uuid, delivery_status text, choice_status text, item_wear text, item_variant_kind text, source_type text);
      create table rewards_coin_transactions(user_id uuid,amount integer,transaction_type text,note text);
      create table rewards_admins(twitch_user_id text primary key);
      grant select on rewards_admins to service_role;
      create table rewards_ttt_rooms(id uuid primary key,host_id uuid,guest_id uuid);
      create table rewards_checkers_rooms(id uuid primary key,host_id uuid,guest_id uuid);
      create table rewards_live_chat(id bigint generated always as identity primary key,room_id uuid,sender_id uuid,nick text,message text,created_at timestamptz default clock_timestamp());
      grant select,update on rewards_users to service_role;
      grant select on rewards_shop_items,rewards_shop_item_variants,rewards_ttt_rooms,rewards_checkers_rooms to service_role;
      grant select,insert on rewards_coin_transactions,rewards_prizes,rewards_wins to service_role;
      grant select,insert,delete on rewards_live_chat to service_role;
      grant usage on sequence rewards_live_chat_id_seq to service_role;
      insert into rewards_users(twitch_user_id,twitch_login) values('a','Alice'),('b','Bob'),('c','Carol');
      insert into rewards_admins values('c');
      insert into rewards_coin_transactions select id,100,'adjustment','fixture' from rewards_users;
      insert into rewards_shop_items(name,image_url,status) values('Skin A','https://example.com/a.png','available'),('Skin B','https://example.com/b.png','available');
      insert into rewards_shop_item_variants select id,'normal','FT',100,true from rewards_shop_items;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115133000_red_button.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261115141000_red_button_total_hold.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261115142000_red_button_admin_chat.sql',import.meta.url),'utf8'));
    const rulesMigration=await readFile(new URL('../supabase/migrations/20261119170000_red_button_nov20_rules.sql',import.meta.url),'utf8');
    await db.exec(rulesMigration.replaceAll('2026-11-20','2099-01-01'));
    await db.exec('set role service_role');
    const call = async (actor,round=null,request=null) => (await db.query('select rewards_red_button($1,$2,$3) as data',[actor,round,request])).rows[0].data;
    const first=(await call('a')).round, token=randomUUID();
    assert.deepEqual((await call('a')).rules,{entryCost:10,cooldownMinutes:20,prizeMin:50,prizeMax:300});
    assert.equal(first.price,100);
    assert.equal(new Date(first.endsAt).getUTCHours(),21);
    await call('a',first.id,token);
    await call('a',first.id,token);
    assert.equal((await call('a')).round.holding,true);
    assert.equal((await call('b')).round.readyAt,null);
    assert.equal(Object.hasOwn((await call('b')).round,'heldSince'),false);
    await assert.rejects(db.query("select rewards_live_chat_feed('b',$1,'hi')",[first.id]),/chat_unavailable/);
    await db.query("select rewards_live_chat_feed('c',$1,'admin message')",[first.id]);
    assert.equal((await call('c')).round.joined,false);
    assert.equal((await db.query('select count(*)::int as n from rewards_coin_transactions where amount=-10')).rows[0].n,1);
    await call('b',first.id,randomUUID());
    await assert.rejects(call('a',first.id,randomUUID()),/cooldown/);
    await db.query("update rewards_red_button_members set last_press=now()-interval '21 minutes' where round_id=$1",[first.id]);
    await call('a',first.id,randomUUID());
    assert.equal((await db.query('select count(*)::int as n from rewards_coin_transactions where amount=-10')).rows[0].n,2);
    // Alice has two holds of 3h and 2h; Bob has the longest individual hold (4h).
    await db.query("update rewards_red_button_rounds set day=day-1,ends_at=now() where id=$1",[first.id]);
    await db.query(`with ranked as (
      select request_id,row_number() over(order by started_at,request_id) n
      from rewards_red_button_holds where round_id=$1
    )
    update rewards_red_button_holds h set
      started_at=r.ends_at-case ranked.n when 1 then interval '9 hours' when 2 then interval '6 hours' else interval '2 hours' end,
      ended_at=case ranked.n when 1 then r.ends_at-interval '6 hours' when 2 then r.ends_at-interval '2 hours' end
    from ranked, rewards_red_button_rounds r where h.request_id=ranked.request_id and r.id=$1`,[first.id]);
    const next=await call('b');
    assert.notEqual(next.round.prize,first.prize);
    assert.equal(next.history[0].nick,'Alice');
    assert.equal(next.history[0].duration,18_000_000);
    await call('b');
    assert.equal((await db.query('select count(*)::int as n from rewards_wins')).rows[0].n,1);
    // Exercise the new rules on a new daily round; the preceding settlement is unchanged.
    await db.exec('reset role');
    await db.exec("insert into rewards_shop_items(name,image_url,status) values('Expensive','https://example.com/exp.png','available');insert into rewards_shop_item_variants select id,'normal','FT',250,true from rewards_shop_items where name='Expensive'");
    await db.exec(rulesMigration.replaceAll('2026-11-20','2000-01-01'));await db.exec('set role service_role');
    await db.query("update rewards_red_button_rounds set day=day-2,ends_at=now() where id=$1",[next.round.id]);
    const revised=await call('a');assert.deepEqual(revised.rules,{entryCost:20,cooldownMinutes:60,prizeMin:50,prizeMax:200});assert(revised.round.price<=200);
    const newer=revised.round.id,request=randomUUID();await call('a',newer,request);await call('a',newer,request);await call('b',newer,randomUUID());
    await db.query("update rewards_red_button_members set last_press=now()-interval '21 minutes' where round_id=$1",[newer]);await assert.rejects(call('a',newer,randomUUID()),/cooldown/);
    await db.query("update rewards_red_button_members set last_press=now()-interval '61 minutes' where round_id=$1",[newer]);await call('a',newer,randomUUID());
    assert.equal((await db.query('select count(*)::int as n from rewards_coin_transactions where amount=-20')).rows[0].n,2);
    await db.exec('reset role;set role authenticated');
    await assert.rejects(call('b'),/permission denied/);
    await assert.rejects(db.exec('select * from rewards_red_button_holds'),/permission denied/);
  } finally { await db.close(); }
});
test('red button shows the current server rules and confirms only the real entry amount',async()=>{
 const dom=new JSDOM(redButtonPage,{url:'https://dropso.test/games/red-button',runScripts:'outside-only'}),w=dom.window;let confirmation='',posts=0;
 try{w.fetch=async(_url,opts)=>{if(opts?.method==='POST')posts++;return Response.json({now:new Date().toISOString(),canPlay:true,rules:{entryCost:20,cooldownMinutes:60,prizeMin:50,prizeMax:200},round:{id:randomUUID(),endsAt:new Date(Date.now()+3600000).toISOString(),joined:false,holding:false},history:[]})};w.dropsoConfirm=async text=>{confirmation=text;return false};w.eval(redButtonScript);await new Promise(r=>setTimeout(r,40));const doc=w.document;assert.equal(doc.getElementById('ruleEntry').textContent,'20');assert.equal(doc.getElementById('ruleCooldown').textContent,'60');assert.equal(doc.getElementById('rulePrizeMax').textContent,'200');doc.getElementById('press').click();await new Promise(r=>setTimeout(r,10));assert.match(confirmation,/20 монет/);assert.equal(posts,0)}finally{w.close()}
});
