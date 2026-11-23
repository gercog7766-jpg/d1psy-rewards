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
    // New 48-hour rules: simulate the second day of the first modern round.
    await db.exec('reset role');
    const anchor=(await db.query("select ((clock_timestamp() at time zone 'Europe/Moscow')::date-1)::text as day")).rows[0].day;
    await db.query("update rewards_red_button_rounds set day=day-5,ends_at=now() where id=$1",[newer]);
    await db.query("update rewards_red_button_rounds set day=day-10 where day=$1::date",[anchor]);
    await db.exec("insert into rewards_shop_items(name,image_url,status) values('Budget skin','https://example.com/budget.png','available'),('Upgrade skin','https://example.com/upgrade.png','available');insert into rewards_shop_item_variants select id,'normal','FT',case when name='Budget skin' then 28 else 45 end,true from rewards_shop_items where name in ('Budget skin','Upgrade skin')");
    const modernMigration=await readFile(new URL('../supabase/migrations/20261120170000_red_button_48h.sql',import.meta.url),'utf8');
    await db.exec(modernMigration.replaceAll('2026-11-21',anchor));await db.exec('set role service_role');
    const modern=await call('a');assert.deepEqual(modern.rules,{entryCost:15,cooldownMinutes:30,roundHours:48,holdMinutes:15});
    const id=modern.round.id;assert.equal(modern.round.prize,'Ожидаем первого участника');
    assert.equal((await db.query("select extract(epoch from ends_at-starts_at)::int as seconds from rewards_red_button_rounds where id=$1",[id])).rows[0].seconds,172800);
    const req=randomUUID();const joined=await call('a',id,req);assert.equal(joined.round.prize,'Награда монетами');
    await call('a',id,req);
    assert.equal((await db.query("select price from rewards_red_button_rounds where id=$1",[id])).rows[0].price,15);
    assert.equal(Object.hasOwn(joined.round,'price'),false);assert.equal(Object.hasOwn(joined.round,'wear'),false);assert.equal(Object.hasOwn(joined.round,'heldSince'),false);
    await db.query("update rewards_red_button_holds set started_at=now()-interval '16 minutes' where round_id=$1",[id]);
    await db.query("update rewards_red_button_rounds set held_since=now()-interval '16 minutes' where id=$1",[id]);
    await db.query("update rewards_red_button_members set last_press=now()-interval '16 minutes' where round_id=$1",[id]);
    assert.equal((await call('a')).round.holder,null);
    assert.equal((await db.query("select extract(epoch from ended_at-started_at)::int as seconds from rewards_red_button_holds where round_id=$1",[id])).rows[0].seconds,900);
    await assert.rejects(call('a',id,randomUUID()),/cooldown/);
    assert.equal((await call('b',id,randomUUID())).round.prize,'Budget skin');
    assert.equal((await call('c',id,randomUUID())).round.prize,'Upgrade skin');
    await db.query("update rewards_red_button_members set last_press=now()-interval '31 minutes' where round_id=$1",[id]);
    await call('a',id,randomUUID());
    assert.equal((await db.query('select count(*)::int as n from rewards_coin_transactions where amount=-15')).rows[0].n,3);
    await db.query("update rewards_red_button_rounds set ends_at=clock_timestamp() where id=$1",[id]);
    await call('b');await call('b');
    assert.equal((await db.query('select count(*)::int as n from rewards_red_button_rounds where id=$1 and winner is not null and win_id is not null',[id])).rows[0].n,1);
    // No affordable skin: the funded coin prize is paid only once.
    const fallback=(await db.query("insert into rewards_red_button_rounds(day,starts_at,ends_at,prize_name,price) values($1::date+2,now()-interval '1 minute',now()+interval '48 hours','Ожидаем первого участника',0) returning id",[anchor])).rows[0].id;
    assert.equal((await call('c',fallback,randomUUID())).round.prize,'Награда монетами');
    await db.query("update rewards_red_button_rounds set ends_at=clock_timestamp() where id=$1",[fallback]);
    await call('c');await call('c');
    assert.deepEqual((await db.query("select count(*)::int as n,coalesce(sum(amount),0)::int as total from rewards_coin_transactions where note=$1",['Красная кнопка · приз · '+fallback])).rows[0],{n:1,total:15});
    // The daily jackpot starts only after the old 48-hour round settles.
    await db.exec('reset role');
    const today=(await db.query("select (clock_timestamp() at time zone 'Europe/Moscow')::date::text as day")).rows[0].day;
    const jackpotMigration=await readFile(new URL('../supabase/migrations/20261122090000_red_button_jackpot.sql',import.meta.url),'utf8');
    await db.exec(jackpotMigration.replaceAll('2026-11-21',anchor).replaceAll('2026-11-23',today));
    await db.exec("insert into rewards_users(twitch_user_id,twitch_login) select 'j'||n,'Jackpot '||n from generate_series(1,15) n;insert into rewards_coin_transactions select id,100,'adjustment','jackpot fixture' from rewards_users where twitch_user_id like 'j%'");
    await db.exec('set role service_role');
    const daily=await call('j1'),dailyId=daily.round.id;assert.deepEqual(daily.rules,{entryCost:10,cooldownMinutes:30,roundHours:24,holdMinutes:15,jackpot:true,bonusAfter:10,bonusEach:10});
    assert.equal((await db.query('select extract(epoch from ends_at-starts_at)::int as seconds from rewards_red_button_rounds where id=$1',[dailyId])).rows[0].seconds,86400);
    for(let n=1;n<=15;n++){const req=randomUUID(),state=await call('j'+n,dailyId,req);await call('j'+n,dailyId,req);const bonus=Math.max(0,n-10)*10;assert.equal(state.round.winnerPrize,n*8+bonus);assert.equal(state.round.nextBank,n*2+bonus);assert.equal(state.round.dropsoBonusEach,bonus);assert.equal(state.round.bank,n*10+2*bonus)}
    assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions where note=$1 and amount=-10',['Красная кнопка · вход · '+dailyId])).rows[0].n,15);
    await db.query("update rewards_red_button_holds set started_at=now()-interval '10 minutes',ended_at=now()-interval '9 minutes' where round_id=$1 and user_id=(select id from rewards_users where twitch_user_id='j1')",[dailyId]);
    await db.query("update rewards_red_button_rounds set day=$2::date-30,ends_at=clock_timestamp() where id=$1",[dailyId,today]);
    const following=await call('j1');await call('j1');assert.equal(following.round.carryIn,80);assert.equal(following.round.winnerPrize,64);assert.equal(following.round.nextBank,16);
    assert.deepEqual((await db.query('select count(*)::int n,sum(amount)::int total from rewards_coin_transactions where note=$1',['Красная кнопка · приз · '+dailyId])).rows[0],{n:1,total:170});
    await db.query("update rewards_red_button_rounds set day=$2::date-29,ends_at=clock_timestamp() where id=$1",[following.round.id,today]);
    const afterEmpty=await call('j1');assert.equal(afterEmpty.round.carryIn,80);assert.equal(afterEmpty.round.bank,80);
    const nextJoined=await call('j1',afterEmpty.round.id,randomUUID());assert.equal(nextJoined.round.winnerPrize,72);assert.equal(nextJoined.round.nextBank,18);assert.equal(nextJoined.round.bank,90);
    await db.exec('reset role');
    await db.exec("insert into rewards_shop_items(name,image_url,status) values('Skin 70','https://example.com/70.png','available'),('Skin 79','https://example.com/79.png','available');insert into rewards_shop_item_variants select id,'normal','FT',case when name='Skin 70' then 70 else 79 end,true from rewards_shop_items where name in ('Skin 70','Skin 79')");
    const skinMigration=await readFile(new URL('../supabase/migrations/20261122210000_red_button_skin_jackpot.sql',import.meta.url),'utf8');await db.exec(skinMigration.replaceAll('2026-11-21',anchor).replaceAll('2026-11-23',today));await db.exec('set role service_role');
    const selected=await call('j1');assert.equal(selected.round.prize,'Skin 70');assert.equal(selected.round.price,70);assert.equal(selected.round.nextBank,20);assert.equal(selected.round.bank,90);
    const grown=await call('j2',afterEmpty.round.id,randomUUID());assert.equal(grown.round.prize,'Skin 79');assert.equal(grown.round.winnerPrize,79);assert.equal(grown.round.nextBank,21);assert.equal(grown.round.bank,100);
    await db.exec('reset role');
    const limitMigration=await readFile(new URL('../supabase/migrations/20261123120000_red_button_press_limit.sql',import.meta.url),'utf8');await db.exec(limitMigration.replaceAll('2026-11-21',anchor));await db.exec('set role service_role');
    const limited=await call('j1');assert.equal(limited.rules.pressLimit,6);assert.equal(limited.round.pressesRemaining,5);assert.equal((await call('j3')).round.pressesRemaining,6);
    let lastRequest;
    for(let n=2;n<=6;n++){
      await db.query("update rewards_red_button_members set last_press=now()-interval '31 minutes' where round_id=$1",[afterEmpty.round.id]);
      lastRequest=randomUUID();const pressed=await call('j1',afterEmpty.round.id,lastRequest);assert.equal(pressed.round.pressesRemaining,6-n);
      if(n<6) await call('j2',afterEmpty.round.id,randomUUID());
    }
    assert.equal((await call('j1',afterEmpty.round.id,lastRequest)).round.pressesRemaining,0);
    await assert.rejects(call('j1',afterEmpty.round.id,randomUUID()),/press_limit/);
    assert.equal((await call('j1')).round.pressesUsed,6);
    await db.query("update rewards_red_button_rounds set day=$2::date-28,ends_at=clock_timestamp() where id=$1",[afterEmpty.round.id,today]);assert.equal((await call('j1')).round.pressesRemaining,6);await call('j1');
    const awarded=(await db.query('select p.name,p.sell_price_coins,w.item_wear from rewards_red_button_rounds r join rewards_wins w on w.id=r.win_id join rewards_prizes p on p.id=w.prize_id where r.id=$1',[afterEmpty.round.id])).rows[0];assert.deepEqual(awarded,{name:'Skin 79',sell_price_coins:79,item_wear:'FT'});
    assert.equal((await db.query('select count(*)::int n from rewards_coin_transactions where note=$1',['Красная кнопка · приз · '+afterEmpty.round.id])).rows[0].n,0);
    await db.exec('reset role;set role authenticated');
    await assert.rejects(call('b'),/permission denied/);
    await assert.rejects(db.exec('select * from rewards_red_button_holds'),/permission denied/);
  } finally { await db.close(); }
});
test('48-hour UI hides pricing and shows only personal cooldown and current prize',async()=>{
 const dom=new JSDOM(redButtonPage,{url:'https://dropso.test/games/red-button',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=async()=>Response.json({now:new Date().toISOString(),canPlay:true,rules:{entryCost:15,cooldownMinutes:30,roundHours:48,holdMinutes:15},round:{id:randomUUID(),endsAt:new Date(Date.now()+3600000).toISOString(),joined:true,holding:false,holder:null,prize:'Budget skin',readyAt:new Date(Date.now()+600000).toISOString()},history:[]});w.eval(redButtonScript);await new Promise(r=>setTimeout(r,40));const d=w.document;assert.equal(d.getElementById('ruleEntry').textContent,'15');assert.equal(d.getElementById('ruleCooldown').textContent,'30');assert.equal(d.getElementById('legacyPrize').hidden,true);assert.equal(d.getElementById('modernPrize').hidden,false);assert.match(d.getElementById('pressLabel').textContent,/Нажатие через/);assert.equal(d.getElementById('prize').textContent,'Budget skin')}finally{w.close()}
});
test('red button shows the current server rules and confirms only the real entry amount',async()=>{
 const dom=new JSDOM(redButtonPage,{url:'https://dropso.test/games/red-button',runScripts:'outside-only'}),w=dom.window;let confirmation='',posts=0;
 try{w.fetch=async(_url,opts)=>{if(opts?.method==='POST')posts++;return Response.json({now:new Date().toISOString(),canPlay:true,rules:{entryCost:20,cooldownMinutes:60,prizeMin:50,prizeMax:200},round:{id:randomUUID(),endsAt:new Date(Date.now()+3600000).toISOString(),joined:false,holding:false},history:[]})};w.dropsoConfirm=async text=>{confirmation=text;return false};w.eval(redButtonScript);await new Promise(r=>setTimeout(r,40));const doc=w.document;assert.equal(doc.getElementById('ruleEntry').textContent,'20');assert.equal(doc.getElementById('ruleCooldown').textContent,'60');assert.equal(doc.getElementById('rulePrizeMax').textContent,'200');doc.getElementById('press').click();await new Promise(r=>setTimeout(r,10));assert.match(confirmation,/20 монет/);assert.equal(posts,0)}finally{w.close()}
});
test('daily jackpot shows exact bank, carryover and Dropso bonus from the eleventh entrant',async()=>{
 const dom=new JSDOM(redButtonPage,{url:'https://dropso.test/games/red-button',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=async()=>Response.json({now:new Date().toISOString(),canPlay:true,rules:{entryCost:10,cooldownMinutes:30,roundHours:24,holdMinutes:15,jackpot:true},round:{id:randomUUID(),endsAt:new Date(Date.now()+3600000).toISOString(),joined:false,holding:false,playerCount:11,prize:'98 монет',bank:130,winnerPrize:98,nextBank:32,carryIn:0,dropsoBonusEach:10},history:[]});w.eval(redButtonScript);await new Promise(r=>setTimeout(r,30));const d=w.document;assert.equal(d.getElementById('jackpotBank').hidden,false);assert.equal(d.getElementById('winnerPrize').textContent,'98');assert.equal(d.getElementById('nextBank').textContent,'32');assert.equal(d.getElementById('jackpotBonus').dataset.active,'true');assert.match(d.getElementById('bonusAmount').textContent,/\+10 в приз и \+10/);assert.equal(d.getElementById('ruleEntry').textContent,'10');assert.equal(d.getElementById('modernPrize').hidden,true);assert.equal(d.getElementById('jackpotRules').hidden,false)}finally{w.close()}
});
test('daily press limit is shown and exhausted players cannot submit',async()=>{
 const dom=new JSDOM(redButtonPage,{url:'https://dropso.test/games/red-button',runScripts:'outside-only'}),w=dom.window;let posts=0;
 try{w.fetch=async(_url,opts)=>{if(opts?.method==='POST')posts++;return Response.json({now:new Date().toISOString(),canPlay:true,rules:{entryCost:10,cooldownMinutes:30,roundHours:24,holdMinutes:15,jackpot:true,pressLimit:6},round:{id:randomUUID(),endsAt:new Date(Date.now()+3600000).toISOString(),joined:true,holding:false,pressesRemaining:0},history:[]})};w.eval(redButtonScript);await new Promise(r=>setTimeout(r,40));const d=w.document;assert.equal(d.getElementById('pressRemaining').textContent,'Осталось нажатий: 0/6');assert.equal(d.getElementById('press').disabled,true);assert.equal(d.getElementById('pressLabel').textContent,'Лимит нажатий исчерпан');d.getElementById('press').click();assert.equal(posts,0)}finally{w.close()}
});
