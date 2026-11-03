-- Multi-stream RPC isolation guards.
-- PREPARED ONLY: do not apply until the additive phase-1 schema is approved.
-- Purpose: make existing round RPCs reject cross-streamer/mismatched calls while
-- keeping the user account/balance model shared and unchanged.

-- Contract required by the TypeScript multi-stream engine:
-- 1. p_round_id identifies the streamer implicitly through rewards_rounds.streamer_id.
-- 2. rewards_record_chat_message may mutate only that round and participation for that round.
-- 3. rewards_finalize_round may finalize only p_round_id; it must not discover a global active round.
-- 4. Neither RPC may update rewards_settings (legacy singleton).
-- 5. User identity/balance remains global; streamer_id scopes giveaway state, not the user account.

-- Validation queries to run immediately before replacing production RPC definitions:
-- select pg_get_functiondef(p.oid)
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname in ('rewards_record_chat_message','rewards_finalize_round');
--
-- select column_name,data_type,is_nullable
-- from information_schema.columns
-- where table_schema='public'
--   and table_name in ('rewards_rounds','rewards_chat_events','rewards_round_participants')
-- order by table_name,ordinal_position;

-- We intentionally do not CREATE OR REPLACE the RPCs in this file yet. Their exact
-- existing bodies must be captured from Supabase first so prize ownership, winner
-- selection, audit rows and balance semantics are preserved byte-for-byte where possible.
