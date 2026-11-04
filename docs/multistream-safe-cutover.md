# Multi-Twitch safe cutover — implementation gates

Status: planning only. No production configuration changes are authorized by this document.

## Verified from main (2026-11-04)
- `src/eventsub.ts`: `MULTISTREAM_DB_ENABLED` routes chat by broadcaster ID; default legacy route still exists.
- `src/multistream-engine.ts`: per-streamer chat, finalize, and next-round functions exist; `tickStreamerRounds` is not wired into server startup.
- `src/engine.ts`: legacy timer runs unless `REWARDS_ENGINE_ENABLED=false`; legacy queries use `status='active'` without streamer filter.
- `src/server-next.ts`: public/admin state and round-start routes use unscoped active-round queries; admin Twitch connect uses primary broadcaster login.
- `migrations/20261103_multistream_phase1.sql`: separate streamer records/settings and per-streamer active-round index. Migration has already been applied according to project operations history; verify live schema before any further migration.
- Production currently serves both streamer and legacy code, but must keep `MULTISTREAM_DB_ENABLED=false` and legacy engine enabled until coordinated cutover.

## Required before activating amych
1. Add broadcaster-scoped read and write paths for public/admin round state, manual start/stop, and settings. Never use `.eq('status','active').maybeSingle()` without a streamer selector after multi-stream is enabled.
2. Wire `tickStreamerRounds` behind an explicit opt-in flag, ensuring the legacy interval is disabled only at a coordinated cutover.
3. Preserve d1psy's existing active round, eligibility, prizes, and winner history; verify existing RPC compatibility and concurrency for two streamers.
4. Implement authenticated broadcaster onboarding/renewal for amych; do not use the PoC OAuth callback on production's normal `/auth/twitch/callback` route.
5. Verify EventSub subscriptions for both broadcasters, webhook signature verification, deduplication, revocation, reconnect handling, and status updates per streamer.
6. Ensure the test service cannot process production giveaways or consume production prizes; use isolated tests and never turn on the legacy engine in TEST.
7. Test concurrent chat, time-based and message-based completion, reconnection, no-prize behavior, and concurrent prize allocation.
8. Prepare a rollback that restores primary routing and legacy timer without duplicate rounds or missing chat events. Take a read-only baseline before cutover.

## Release policy
- Changes only on `feature/multistream-safe-cutover` until reviewed.
- No production redeploy, environment variable flip, Twitch subscription change, or Supabase mutation during preparation.
- Existing Twitch login, drops, and admin item quality remain untouched.
