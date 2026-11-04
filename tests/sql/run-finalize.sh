#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=multistream_test
psql -X -v ON_ERROR_STOP=1 -c 'drop schema if exists public cascade; create schema public;' >/dev/null
psql -X -v ON_ERROR_STOP=1 -f tests/sql/finalize_fixture.sql >/dev/null
# Load the *actual* phase-1 function body, not a rewritten test implementation.
sed -n '/^create or replace function public.rewards_finalize_round(/,$p' migrations/20261103_multistream_phase1.sql |
  psql -X -v ON_ERROR_STOP=1 >/dev/null
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_active_prize_guard_proposal.sql >/dev/null
psql -X -At -v ON_ERROR_STOP=1 -c "select * from public.rewards_finalize_round('20000000-0000-4000-8000-000000000001');" >/tmp/finalize_primary.out 2>&1 &
a=$!
psql -X -At -v ON_ERROR_STOP=1 -c "select * from public.rewards_finalize_round('20000000-0000-4000-8000-000000000002');" >/tmp/finalize_secondary.out 2>&1 &
b=$!
wait "$a" || { cat /tmp/finalize_primary.out; exit 1; }
wait "$b" || { cat /tmp/finalize_secondary.out; exit 1; }
result=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='completed' and completion_reason='winner_selected';")
test "$result" = "2" || { echo "FAIL: expected two completed rounds"; exit 1; }
wins=$(psql -X -At -c "select count(*) from public.rewards_wins;")
test "$wins" = "2" || { echo "FAIL: expected two wins"; exit 1; }
assigned=$(psql -X -At -c "select count(*) from public.rewards_prizes where status='assigned';")
test "$assigned" = "2" || { echo "FAIL: expected two assigned prizes"; exit 1; }
if psql -X -v ON_ERROR_STOP=1 -c "select * from public.rewards_finalize_round('20000000-0000-4000-8000-000000000001');" >/tmp/finalize_repeat.out 2>&1; then
 echo "FAIL: repeated finalization unexpectedly succeeded"; exit 1
fi
grep -q 'round_not_active' /tmp/finalize_repeat.out || { cat /tmp/finalize_repeat.out; exit 1; }
wins=$(psql -X -At -c "select count(*) from public.rewards_wins;")
test "$wins" = "2" || { echo "FAIL: duplicate win"; exit 1; }
echo "PASS: two streamer finalizations, prize assignment and duplicate-finalization rejection"

# Concurrent finalize versus scoped stop: either winner or cancellation may win,
# but never both. Repeat with fresh rounds to exercise scheduling differences.
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_atomic_stop_proposal.sql >/dev/null
for n in 1 2 3 4; do
  psql -X -v ON_ERROR_STOP=1 -c "
    update public.rewards_streamer_settings set enabled=true
      where streamer_id='00000000-0000-4000-8000-000000000002';
    insert into public.rewards_prizes(id,status) values
      (('40000000-0000-4000-8000-' || lpad($n::text,12,'0'))::uuid,'available');
    insert into public.rewards_rounds(id,streamer_id,prize_id,status) values
      (('50000000-0000-4000-8000-' || lpad($n::text,12,'0'))::uuid,
       '00000000-0000-4000-8000-000000000002',
       ('40000000-0000-4000-8000-' || lpad($n::text,12,'0'))::uuid,'active');
    insert into public.rewards_round_participants(round_id,user_id,eligible) values
      (('50000000-0000-4000-8000-' || lpad($n::text,12,'0'))::uuid,
       '30000000-0000-4000-8000-000000000002',true);
  " >/dev/null
  rid="50000000-0000-4000-8000-$(printf '%012d' "$n")"
  psql -X -At -v ON_ERROR_STOP=1 -c "select * from public.rewards_finalize_round('$rid');" >"/tmp/finalize_stop_final_$n.out" 2>&1 &
  a=$!
  psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_stop_round('00000000-0000-4000-8000-000000000002');" >"/tmp/finalize_stop_stop_$n.out" 2>&1 &
  b=$!
  wait "$a" || true
  wait "$b" || { cat "/tmp/finalize_stop_stop_$n.out"; exit 1; }
  state=$(psql -X -At -c "select status from public.rewards_rounds where id='$rid';")
  test "$state" = "completed" -o "$state" = "cancelled" || { echo "FAIL: unexpected state $state"; exit 1; }
  win_count=$(psql -X -At -c "select count(*) from public.rewards_wins where round_id='$rid';")
  if [ "$state" = "completed" ]; then
    test "$win_count" = "1" || { echo "FAIL: completed round without exactly one win"; exit 1; }
  else
    test "$win_count" = "0" || { echo "FAIL: cancelled round received a win"; exit 1; }
  fi
done
echo "PASS: finalize versus scoped stop cannot double-award or award cancelled round"

# No eligible participants: round completes without a win and prize remains available.
psql -X -v ON_ERROR_STOP=1 -c "
 insert into public.rewards_prizes(id,status) values ('60000000-0000-4000-8000-000000000001','available');
 insert into public.rewards_rounds(id,streamer_id,prize_id,status) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','active');
" >/dev/null
reason=$(psql -X -At -v ON_ERROR_STOP=1 -c "select completion_reason from public.rewards_finalize_round('70000000-0000-4000-8000-000000000001');")
test "$reason" = "no_eligible_participants" || { echo "FAIL: no-participants reason $reason"; exit 1; }
count=$(psql -X -At -c "select count(*) from public.rewards_wins where round_id='70000000-0000-4000-8000-000000000001';")
test "$count" = "0" || { echo "FAIL: empty round awarded a win"; exit 1; }
status=$(psql -X -At -c "select status from public.rewards_prizes where id='60000000-0000-4000-8000-000000000001';")
test "$status" = "available" || { echo "FAIL: empty round consumed prize"; exit 1; }
echo "PASS: no eligible participants does not award or consume prize"

# Unlimited prize: winner is recorded but the prize stays available.
psql -X -v ON_ERROR_STOP=1 -c "
 insert into public.rewards_prizes(id,status,unlimited) values ('60000000-0000-4000-8000-000000000002','available',true);
 insert into public.rewards_rounds(id,streamer_id,prize_id,status) values
 ('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','active');
 insert into public.rewards_round_participants(round_id,user_id,eligible) values
 ('70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',true);
" >/dev/null
reason=$(psql -X -At -v ON_ERROR_STOP=1 -c "select completion_reason from public.rewards_finalize_round('70000000-0000-4000-8000-000000000002');")
test "$reason" = "winner_selected" || { echo "FAIL: unlimited-prize reason $reason"; exit 1; }
count=$(psql -X -At -c "select count(*) from public.rewards_wins where round_id='70000000-0000-4000-8000-000000000002';")
test "$count" = "1" || { echo "FAIL: unlimited prize expected one win"; exit 1; }
status=$(psql -X -At -c "select status from public.rewards_prizes where id='60000000-0000-4000-8000-000000000002';")
test "$status" = "available" || { echo "FAIL: unlimited prize incorrectly consumed"; exit 1; }
echo "PASS: unlimited prize awards win without consuming prize"
