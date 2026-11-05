# Multi-Twitch: completion and administrative isolation review

Status: **not approved for production cutover**. This review is based on the feature branch code, not a full production-schema integration test.

## Verified by source review
- Legacy engine and public/admin state queries select `streamer_id IS NULL` rounds. This preserves the existing primary broadcaster's legacy round representation.
- Legacy admin stop only cancels `streamer_id IS NULL` active rounds.
- Secondary streamer stop uses `rewards_streamer_stop_round` and filters by the authenticated streamer's UUID.
- The secondary engine's next-round creation uses `rewards_streamer_start_round` rather than separately selecting/inserting a prize.
- Disposable PostgreSQL CI covers competing starts, scoped stop, and competing start/stop; it does **not** execute the real production finalize RPC.

## Open blockers before any production migration
1. The existing `rewards_finalize_round` locks the round and then the prize. It checks streamer settings without a row lock. Test finalize vs stop with the complete real schema, including participants, wins, audit log and crypto-index helper.
2. Legacy admin manual start and the legacy automatic engine still select a prize outside a transaction. The proposed unique active-prize index prevents duplicate *active* reservations but a conflict can cause an HTTP error or skipped automatic round; migrate both to atomic reservation or add a safe retry before enabling secondary rounds.
3. `rewards_finalize_round` assigns a finite prize when a winner exists. Test concurrent finalizations of different rounds, duplicate finalization requests, and no-eligible-participant outcomes using the real function.
4. The unique active-prize index must pass `tests/sql/preflight_active_rounds.sql` against an isolated copy of the real data. Do not silently clean conflicting records.
5. Verify the complete production table columns and RLS/function grants before applying the draft RPC migrations. The CI fixture intentionally models only the subset needed for start/stop.
6. The secondary engine ticker is not wired into production startup and must remain off until isolated end-to-end tests pass.

No production DB mutation, Render deployment, Twitch subscription change, or feature-flag activation is authorized by these checks.
