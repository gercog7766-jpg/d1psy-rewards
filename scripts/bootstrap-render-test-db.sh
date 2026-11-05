#!/usr/bin/env bash
# Run only from a trusted shell with psql installed and DATABASE_URL set to
# the isolated Render PostgreSQL database. Never run against Supabase production.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL for the isolated Render test database}"
if [[ "${CONFIRM_TEST_DB_BOOTSTRAP:-}" != "d1psy_multistream_test_db" ]]; then
  echo "Refusing bootstrap: set CONFIRM_TEST_DB_BOOTSTRAP=d1psy_multistream_test_db" >&2
  exit 2
fi
actual=$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')
if [[ "$actual" != "d1psy_multistream_test_db" ]]; then
  echo "Refusing bootstrap: connected to unexpected database: $actual" >&2
  exit 2
fi
existing=$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
if [[ "$existing" != "0" ]]; then
  echo "Refusing bootstrap: public schema already has $existing tables" >&2
  exit 2
fi
tmp_sql=$(mktemp)
trap 'rm -f "$tmp_sql"' EXIT
cat tests/sql/finalize_fixture.sql > "$tmp_sql"
sed -n '/^create or replace function public.rewards_finalize_round(/,$p' migrations/20261103_multistream_phase1.sql >> "$tmp_sql"
cat migrations/20261104_active_prize_guard_proposal.sql >> "$tmp_sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 -f "$tmp_sql"
echo "Initialized disposable finalization fixture with fictional test prizes."
echo "This is NOT the full application schema and does NOT enable the test website."
