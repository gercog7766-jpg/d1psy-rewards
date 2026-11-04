# Isolated Render test database: connection and application constraints

Render database: `dpg-dblg1imgekts738ahc2g-a` / `d1psy_multistream_test_db` (free Frankfurt).
The production Supabase project is **not** a substitute for this database.

## Current blockers
- Render's connected SQL-query tool is read-only and cannot reach the database with an empty external IP allowlist. Do not expose the database to `0.0.0.0/0` to work around this.
- The application uses `@supabase/supabase-js` and expects Supabase PostgREST RPC endpoints, not a PostgreSQL connection string. Setting `DATABASE_URL` alone does **not** isolate the website.
- The existing test Render service still has production-facing Supabase/Twitch credentials and runs from `poc/multistream-amych`, not the PR #5 feature branch. **Do not enable round writes or live chat engine there.**
- The SQL fixture is intentionally minimal: it supports isolated finalization tests but not Twitch OAuth, user dashboards, prizes API, or full giveaway functionality.

## Safe offline bootstrap (when a trusted database connection is available)
From a trusted shell with `psql` and the **test** Render connection URL:
```bash
export DATABASE_URL='...test database URL, do not commit...'
export CONFIRM_TEST_DB_BOOTSTRAP=d1psy_multistream_test_db
bash scripts/bootstrap-render-test-db.sh
```
The script verifies the database name and refuses non-empty public schemas. Credentials must stay out of logs and GitHub.

## Before an amych end-to-end test
1. Establish a supported, secure SQL-write path to the Render test database without widening the IP allowlist.
2. Decide and implement an isolated API layer compatible with the application's Supabase calls, **or** create a separate test-only Supabase project. Neither is implemented.
3. Apply the full test application schema and fake prizes, configure test-specific OAuth callbacks/secrets, and verify test service credentials point only at the isolated backend.
4. Run login, streamer scope, start, stop, finalize and win tests with fake data.
5. Keep production untouched until explicit cutover approval.
