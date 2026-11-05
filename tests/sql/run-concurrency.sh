#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=multistream_test
psql -X -v ON_ERROR_STOP=1 -f tests/sql/multistream_fixture.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_active_prize_guard_proposal.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_atomic_start_proposal.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_atomic_stop_proposal.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f migrations/20261104_atomic_legacy_start_proposal.sql >/dev/null

# With one prize, two streamers racing cannot both reserve it.
# Both calls are real concurrent PostgreSQL sessions.
psql -X -At -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000002');" > /tmp/streamer_a.out 2>&1 &
a=$!
psql -X -At -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000003');" > /tmp/streamer_b.out 2>&1 &
b=$!
wait "$a" || true
wait "$b" || true
count=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='active';")
test "$count" = "1" || { echo "FAIL: expected one active round, got $count"; exit 1; }
duplicates=$(psql -X -At -c "select count(*) from (select prize_id from public.rewards_rounds where status='active' group by prize_id having count(*)>1) x;")
test "$duplicates" = "0" || { echo "FAIL: duplicate active prize"; exit 1; }
echo "PASS: concurrent one-prize reservation"

# Reset via RPC for whichever streamer won, then introduce second prize.
owner=$(psql -X -At -c "select streamer_id from public.rewards_rounds where status='active' limit 1;")
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_stop_round('$owner');" >/dev/null
psql -X -v ON_ERROR_STOP=1 -c "insert into public.rewards_prizes(id,status) values ('10000000-0000-4000-8000-000000000002','available');" >/dev/null
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000002');" >/dev/null &
a=$!
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000003');" >/dev/null &
b=$!
wait "$a"
wait "$b"
count=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='active';")
test "$count" = "2" || { echo "FAIL: expected two active rounds"; exit 1; }
duplicates=$(psql -X -At -c "select count(*) from (select prize_id from public.rewards_rounds where status='active' group by prize_id having count(*)>1) x;")
test "$duplicates" = "0" || { echo "FAIL: shared prize"; exit 1; }
echo "PASS: two streamers receive distinct prizes"

# Primary broadcaster must never be controlled through streamer RPC.
if psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000001');" >/dev/null 2>&1; then
  echo "FAIL: primary admin isolation"; exit 1
fi
echo "PASS: primary broadcaster isolation"

# Repeat start for same streamer must fail; stop must only cancel its own round.
if psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000002');" >/dev/null 2>&1; then
  echo "FAIL: duplicate start"; exit 1
fi
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_stop_round('00000000-0000-4000-8000-000000000002');" >/dev/null
remaining=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='active' and streamer_id='00000000-0000-4000-8000-000000000003';")
test "$remaining" = "1" || { echo "FAIL: cross-stream stop"; exit 1; }
echo "PASS: duplicate start and scoped stop"

# Competing stop/start requests for the same streamer must not create
# two active rounds, even if either operation wins the row lock.
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_stop_round('00000000-0000-4000-8000-000000000003');" >/dev/null
psql -X -At -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000003');" >/tmp/race_start.out 2>&1 &
a=$!
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_stop_round('00000000-0000-4000-8000-000000000003');" >/tmp/race_stop.out 2>&1 &
b=$!
wait "$a" || true
wait "$b" || true
count=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='active' and streamer_id='00000000-0000-4000-8000-000000000003';")
test "$count" -le 1 || { echo "FAIL: concurrent start/stop duplicated active rounds"; exit 1; }
duplicates=$(psql -X -At -c "select count(*) from (select prize_id from public.rewards_rounds where status='active' group by prize_id having count(*)>1) x;")
test "$duplicates" = "0" || { echo "FAIL: concurrent stop/start duplicated prize"; exit 1; }
echo "PASS: concurrent start/stop preserves active-round and prize uniqueness"

# Race the legacy broadcaster against a secondary streamer for a single new prize.
# All earlier rounds are cancelled to make the contention deterministic.
psql -X -v ON_ERROR_STOP=1 -c "update public.rewards_rounds set status='cancelled',ended_at=now() where status='active'; update public.rewards_prizes set status='unavailable'; insert into public.rewards_prizes(id,status) values ('10000000-0000-4000-8000-000000000003','available');" >/dev/null
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_legacy_start_round();" >/tmp/legacy_race.out 2>&1 &
a=$!
psql -X -At -v ON_ERROR_STOP=1 -c "select public.rewards_streamer_start_round('00000000-0000-4000-8000-000000000002');" >/tmp/secondary_race.out 2>&1 &
b=$!
wait "$a" || true
wait "$b" || true
count=$(psql -X -At -c "select count(*) from public.rewards_rounds where status='active';")
test "$count" = "1" || { echo "FAIL: legacy/secondary race created $count active rounds"; cat /tmp/legacy_race.out /tmp/secondary_race.out; exit 1; }
echo "PASS: legacy and secondary race for a single prize"
