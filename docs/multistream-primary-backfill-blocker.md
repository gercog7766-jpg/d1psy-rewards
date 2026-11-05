# Critical compatibility finding: phase-1 backfill

The already-applied `20261103_multistream_phase1.sql` **backfills all legacy rounds** with the primary streamer's UUID. The feature branch's interim assumption that primary rounds have `streamer_id IS NULL` is therefore false for migrated data.

**Do not merge or deploy the current feature branch** until all legacy reads, manual/automatic starts, stops, and finalization use a consistent primary-streamer scope. Mixing primary-ID and NULL scopes can produce two simultaneous primary rounds because the migration deliberately creates separate partial unique indexes for those scopes.

Required acceptance checks:
1. Legacy primary ID resolves from `rewards_streamers` by `is_primary=true` and all legacy read/start/stop paths use that ID.
2. Legacy atomic start inserts `streamer_id=primary_id`, not NULL.
3. No route selects `maybeSingle()` across both scopes.
4. A test fixture starts a primary-ID round and a secondary-ID round concurrently, then proves admin stop affects primary only.
5. Test the actual `rewards_finalize_round` function against the complete schema before enabling writes.

This is a blocker identified by comparing the applied phase-1 migration with current branch code; existing CI fixtures did not model the backfill.
