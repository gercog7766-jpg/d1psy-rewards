# Giveaway settings cache

Only `rewards_settings` reads used by the primary engine tick and public/admin state polling are cached, for 15 seconds. Each Supabase client has its own cache; concurrent reads on that client share one database request. Errors and missing settings are not cached and never fall back to stale successful values.

Every application write to settings goes through `updateSettings`. This invalidates all client caches before and after the database operation, including failed writes. In-flight reads from an older generation retry rather than restoring stale settings. Manual round start and automatic next-round creation still read settings directly. Rounds, message counts, prizes, users, wallets and authorization are not cached by this change.

The deployment has one active Node process on the VPS. Direct edits in Supabase or writes from another process become visible within 15 seconds; invalidation is local to this process. Keep Render suspended as required by the VPS migration guide. If running multiple application processes in the future, introduce shared invalidation before relying on immediate cross-process visibility.

The one-second idle engine loop should make about 5,760 settings reads per day instead of 86,400, excluding invalidations and round transitions. This is a request-count estimate for settings only, not a measured reduction in total Supabase egress. Compare actual Usage over complete days after deploying.

Verification: `node --import tsx --test tests/settings-cache.test.mjs` covers coalescing, TTL, client isolation, start/stop/Twitch invalidation, read/write races, failed reads/writes, and actual app/OBS polling with live round counts against a local mock PostgREST server.
