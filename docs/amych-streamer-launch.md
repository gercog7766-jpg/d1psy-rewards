# amych — isolated streamer dashboard

## Exact targets

- Test site: `d1psy-rewards-multistream-test`, `srv-dbktcpoae00c73c1c5c0`, branch `poc/multistream-amych`.
- API/dashboard: `d1psy-multistream-isolated-api`, `srv-dblgb3gae00c73c69nl0`, branch `feature/isolated-amych-oauth-eventsub`.
- Database: `d1psy-multistream-test-db`, `dpg-dblg1imgekts738ahc2g-a`, logical database `d1psy_multistream_test_db`.
- Production main, production Supabase, and the main Render service are not deployment targets for this change.

## Sign-in

Open `https://d1psy-rewards-multistream-test.onrender.com/streamer` (redirects to the isolated API) or `https://d1psy-multistream-isolated-api.onrender.com/streamer`.

amych clicks Twitch sign-in and grants chat permissions on Twitch. Both the OAuth validation endpoint and Helix user identity must match Twitch ID `39780903` and login `amych`, using the existing isolated OAuth application. Other accounts cannot receive a dashboard session. Existing subscriptions are reused after a 409 conflict; primary subscriptions are neither removed nor changed.

The callback URI remains `https://d1psy-multistream-isolated-api.onrender.com/oauth/twitch/callback`. No new callback registration or admin API token is required in the dashboard. Twitch user access tokens are not persisted. A separate random HttpOnly/Secure session cookie lasts seven days; only its SHA-256 hash is stored in the test database, and logout deletes that session. Sessions, settings, rounds and counters survive API restarts.

## Feature flag and storage

Set only `ISOLATED_STREAMER_DASHBOARD=true` on the isolated API service, merging existing env vars. Keep production giveaway/routing flags disabled. Initialization refuses another logical database and refuses Supabase credentials. It creates only the six `amych_dashboard_*` tables, with fixed broadcaster checks, RLS and PUBLIC privileges revoked. It never migrates or writes the existing `rewards_*` fixture tables. The private database does not need an external IP allowlist change.

`/healthz` exposes only readiness booleans and the isolated subscription status. `streamerDashboard` and `streamerLoginReady` should both be true. The status of an actual owner session still requires amych to complete Twitch consent.

## Dashboard behavior

The owner configures a test prize label, time/message mode, interval and message threshold. Start requires a currently enabled isolated Twitch subscription. Settings cannot change during an active round. Starts have request UUIDs; retries cannot duplicate rounds. Settings versions reject stale edits.

Only verified signed EventSub notifications for broadcaster `39780903` reach the optional persistent dashboard hook. Primary-channel events retain their existing acknowledgement-only behavior. Messages are durably deduplicated by Twitch message ID. Each viewer gets one participant entry, regardless of message count; the channel owner's messages do not count. Only message ID, receipt time and participant identity are stored, not chat text.

Time expiry, message thresholds and manual draws select at most one test winner under a streamer-settings row lock. Sampling uses Node crypto.randomInt. Stop cancels without a winner. Expired time rounds are also completed when the dashboard or another signed event arrives. Free-service sleep therefore cannot admit late participants into an expired round.

**This is an isolated test, not real prize delivery.** It never creates production wins, orders, coin transfers, or reserves a real shared prize. Labels and winner results remain in the isolated dashboard tables.

## Acceptance check with amych

1. Open the stable sign-in link in amych's browser, using his own Twitch account.
2. Confirm the dashboard shows amych and Twitch connected.
3. Save message mode with threshold 2 and a clearly named test prize.
4. Start a test round. A different viewer sends two messages in amych's chat.
5. Verify message count 2, unique participant count 1, one completed round and one test winner.
6. Reload the page and confirm settings/history remain. Stop a second test round and confirm no winner is chosen.
7. Never use this acceptance check to alter production rewards or primary-channel state.

## Validation

API tests include private sessions, persistence after a reconstructed instance, invalid identity/CSRF/origin, stale settings, duplicate starts/chat, primary isolation, timer completion, cancellation, subscription-conflict recovery, one-time OAuth state and safe DOM text rendering. Existing isolated API/PoC tests remain enabled; three optional live-DB suites remain skipped without explicit verification flags. The test-site entry is separately checked to reject the production origin. No actual amych session is fabricated during testing.
