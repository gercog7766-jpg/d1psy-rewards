# Isolated Twitch EventSub probe — deployment gate

This is a **read-only** receiver for synthetic or future authorized Twitch
EventSub traffic. It does **not** subscribe to Twitch, authorize `amych`,
write chat messages, start rounds, or award prizes.

## Before creating any service

- Keep production `d1psy-rewards` and its environment untouched.
- Do not repurpose `d1psy-rewards-multistream-test`: it has shared
  production credentials and is not an isolated Twitch environment.
- Reuse only the disposable Render PostgreSQL database named
  `d1psy_multistream_test_db`. Verify the internal connection string in
  Render without copying it into GitHub or chat.
- Confirm Render has a **free** web-service slot available before creating
  anything. Do not select a paid instance or enable auto-deploy.
- The existing isolated dashboard service runs `node test-api/server.mjs`.
  Do not replace its start command: that would take the dashboard offline.

## Dedicated probe service (not yet provisioned)

Repository: `gercog7766-jpg/d1psy-rewards`

Branch: `feature/multistream-safe-cutover`

Build: `npm install --ignore-scripts --no-audit --no-fund`

Start: `node test-api/twitch-probe.mjs`

Auto-deploy: **off**. Plan: **free** only, if available.

Required environment:

```text
ISOLATED_TEST_API=true
TWITCH_PROBE_ENABLED=true
TWITCH_PROBE_BROADCASTER_ID=39780903
DATABASE_URL=<internal URL of disposable d1psy_multistream_test_db>
TWITCH_PROBE_SECRET=<independent random secret of at least 32 characters>
```

Do not set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
`TWITCH_ACCESS_TOKEN`, or `TWITCH_REFRESH_TOKEN`.
Do not set `ENABLE_GIVEAWAYS=true`, `MULTISTREAM_DB_ENABLED=true`,
or `ATOMIC_CHAT_RPC_ENABLED=true`.

Never reuse production EventSub signing secrets. Do not place the probe
URL into production Twitch subscription configuration.

## Verification (no real Twitch subscription)

- `GET /healthz` must return HTTP 200.
- Unsigned `POST /eventsub/twitch` must return HTTP 403.
- `GET /eventsub/twitch` must return HTTP 404.
- CI test `tests/twitch-probe-http.test.mjs` exercises signed challenge,
  signed secondary notification, wrong broadcaster and invalid signature
  against disposable PostgreSQL.

Do **not** ask `amych` to authorize until a separate review confirms
the probe has no production credentials, callback URL is correct, and
the Twitch subscription can be created without touching production.
