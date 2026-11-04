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
