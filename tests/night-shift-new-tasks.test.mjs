import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Night Shift grants new objectives at their strict thresholds and ignores older Night Run sessions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table rewards_season_daily_schedule(day date,task_key text,target int,reward int);
      create table rewards_season_task_progress(user_id uuid,season_id text,task_key text,period_key text,progress int,completed_at timestamptz,sp_awarded int,updated_at timestamptz,primary key(user_id,season_id,task_key,period_key));
      create table rewards_checkers_rooms(host_id uuid,guest_id uuid,status text);
      create table rewards_black_box_bids(user_id uuid);
      create table rewards_ms_games(user_id uuid,status text,difficulty text,started_at timestamptz,finished_at timestamptz);
      create table rewards_defuse_games(like rewards_ms_games);
      create table rewards_guess_rounds(winner_id uuid,status text,ended_at timestamptz);
      create table rewards_nr_games(user_id uuid,status text,version int,tick int,distance bigint,started_at timestamptz,finished_at timestamptz);
      create table rewards_red_button_rounds(id uuid,ends_at timestamptz);
      create table rewards_red_button_holds(round_id uuid,user_id uuid,started_at timestamptz,ended_at timestamptz);
      create table rewards_upgrades(user_id uuid,created_at timestamptz,extra_coins int,result text,chance_bps int,source_value_coins int,target_value_coins int);
      create function rewards_s1_day() returns text language sql as $$ select '2026-11-16'::text $$;
      create function rewards_s1_week() returns text language sql as $$ select 'M2026-11-16'::text $$;
      create function rewards_vault_enqueue(uuid,text,text,timestamptz,jsonb) returns void language plpgsql as $$ begin return; end $$;
      create function rewards_season_add_task_progress(uuid,text,int,int,int,text,bool) returns void language sql as $$
        insert into public.rewards_season_task_progress values($1,'s1',$2,$6,$3,case when $3 >= $4 then now() end,$5,now())
        on conflict (user_id,season_id,task_key,period_key) do update
        set progress=least($4,rewards_season_task_progress.progress+excluded.progress),
          completed_at=case when rewards_season_task_progress.progress+excluded.progress >= $4 then now() end
      $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261115140000_night_shift_new_tasks.sql',import.meta.url),'utf8'));
    await db.exec('create trigger s1_upgrade after insert on rewards_upgrades for each row execute function rewards_s1_upgrade_trigger()');
    const user = '77777777-7777-4777-8777-777777777777';
    const completed = async key => (await db.query('select count(*)::int as n from rewards_season_task_progress where task_key=$1 and completed_at is not null',[key])).rows[0].n;
    const mines = async seconds => {
      await db.query("insert into rewards_ms_games values($1,'playing','hard','2026-11-16 08:00:00+00',null)",[user]);
      await db.query("update rewards_ms_games set status='won',finished_at=started_at+make_interval(secs => $1) where status='playing'",[seconds]);
    };
    await mines(270);
    assert.equal(await completed('minesweeper_hard_under_270'),0);
    await mines(25);
    assert.equal(await completed('minesweeper_under_25'),0);
    await mines(24.99);
    assert.equal(await completed('minesweeper_under_25'),1);
    assert.equal(await completed('minesweeper_hard_under_270'),1);
    const run = async (started,distance) => {
      await db.query("insert into rewards_nr_games values($1,'playing',4,1000,$2,$3,'2026-11-16 08:00:00+00')",[user,distance,started]);
      await db.exec("update rewards_nr_games set status='crashed' where status='playing'");
    };
    await run('2026-11-15 20:59:59+00',111112*40);
    await run('2026-11-15 21:00:00+00',111111*40);
    assert.equal(await completed('night_run_over_111111'),0);
    await run('2026-11-15 21:00:00+00',111112*40);
    assert.equal(await completed('night_run_over_111111'),1);
    await db.query("insert into rewards_upgrades values($1,'2026-11-16',0,'won',300,10,1000)",[user]);
    assert.equal(await completed('upgrade_under_3'),0);
    await db.query("insert into rewards_upgrades values($1,'2026-11-16',0,'won',299,10,1000)",[user]);
    assert.equal(await completed('upgrade_under_3'),1);
    assert.equal(await completed('allin'),0);
    await db.exec("insert into rewards_red_button_rounds values ('22222222-2222-4222-8222-222222222222','2026-11-17 21:00:00+00')");
    await db.query(`insert into rewards_red_button_holds values
      ('22222222-2222-4222-8222-222222222222',$1,'2026-11-16 08:00:00+00','2026-11-16 10:00:00+00'),
      ('22222222-2222-4222-8222-222222222222',$1,'2026-11-17 08:00:00+00','2026-11-17 11:00:00+00')`, [user]);
    await db.query("select rewards_s1_sync_red_hold($1,'2026-11-17 12:00:00+00')",[user]);
    await db.query("select rewards_s1_sync_red_hold($1,'2026-11-17 12:00:00+00')",[user]);
    assert.equal(await completed('red_button_300'),1);
    assert.equal((await db.query("select progress from rewards_season_task_progress where task_key='red_button_300'")).rows[0].progress,300);
  } finally { await db.close(); }
});
