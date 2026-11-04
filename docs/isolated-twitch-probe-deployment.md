# Twitch EventSub for amych — free isolated deployment

## Current state (2026-11-04)

- Existing **free** Render web service: `d1psy-multistream-isolated-api`
  (`srv-dblgb3gae00c73c69nl0`).
- URL: `https://d1psy-multistream-isolated-api.onrender.com`
- Branch: `feature/multistream-safe-cutover`; manual deploy, auto-deploy off.
- Start command: `node test-api/server.mjs` — serves the existing test dashboard
  and an **opt-in**, read-only `POST /eventsub/twitch` handler.
- Disposable PostgreSQL: `d1psy_multistream_test_db` (Render free instance).
- Latest verified deployed commit at time of writing: `bbf90e6`.
- `amych` broadcaster Twitch ID: `39780903`.
- Twitch webhook **not enabled**; no subscription has been created.
- The streamer has finished the stream; no live-stream dependency for offline testing.

**Do not create another Render service or replace the dashboard start command.**
Do not modify production, the old test service with shared production credentials,
or any production Supabase project.

## Safety gates before enabling the webhook

1. Keep `ISOLATED_TEST_API=true`, `DATABASE_URL` pointing only to the
   disposable `d1psy_multistream_test_db`, and the existing
   `TEST_API_TOKEN` (do not share either secret).
2. Confirm no `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
   `TWITCH_ACCESS_TOKEN`, or `TWITCH_REFRESH_TOKEN`
   are present in this service. The probe refuses to enable with these.
3. Confirm `ENABLE_GIVEAWAYS`, `MULTISTREAM_DB_ENABLED`, and
   `ATOMIC_CHAT_RPC_ENABLED` are not `true`.
4. Generate a **new, independent, random** `TWITCH_PROBE_SECRET` of
   at least 32 characters and set it **only in Render**. Never use an
   existing Twitch or production secret. Do not paste it in GitHub or chat.
5. Only after all checks, set `TWITCH_PROBE_ENABLED=true` and
   `TWITCH_PROBE_BROADCASTER_ID=39780903` on the isolated service.
   A Render environment change can restart/redeploy the service.
6. Use `GET /api/test/twitch-probe-status` with the existing
   `Authorization: Bearer <TEST_API_TOKEN>` header to verify
   `enabled:true`; without a token it must return HTTP 401.
   This status reports local readiness **only**, not Twitch connectivity.

## Offline verification (no Twitch account needed)

- `GET /healthz` returns `{"ok":true,"isolated":true}`.
- `GET /test-dashboard` remains available.
- Before enabling, `POST /eventsub/twitch` returns HTTP 405.
- After enabling, unsigned `POST /eventsub/twitch` returns HTTP 403.
- GitHub CI runs `tests/shared-twitch-probe-http.test.mjs` using a
  **synthetic** signing secret, signed challenge and notification for
  `39780903`, rejection of primary broadcaster `511100980`, and
  verification that the dashboard still works.
- Do not send the real secret to an online tester or into logs.

## Real Twitch subscription — separate approval gate

This code **does not create subscriptions**, request Twitch OAuth, store chat,
or count entries. A real `channel.chat.message` subscription requires a
Twitch-authorized subscription creation flow with appropriate permissions,
which is **not** configured on this isolated service.

Do not reuse production Twitch credentials or create a real subscription
until an independently isolated Twitch authorization path has been reviewed.
Do not ask `amych` to authorize yet. A read-only 204 acknowledgement is
not a giveaway integration.

## Rollback

Set `TWITCH_PROBE_ENABLED=false` (or remove it). The webhook returns to
HTTP 405; the dashboard and read-only test API continue operating.
Keep auto-deploy off and never merge this branch into `main`.
