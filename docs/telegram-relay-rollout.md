# Telegram bonus relay

The primary Dropso deployment and all balances stay on SpaceWeb. The separate Render web service runs `node scripts/telegram-relay.mjs` (no dependencies or database). Telegram sends webhook updates to Render; the relay verifies membership in `@dropso_cs2` and sends the token hash and Telegram ID to the fixed Dropso HTTPS endpoint. Dropso never connects to Render or Telegram in relay mode. The browser never sees the shared service secret.

## Deploy and configure

1. Deploy the service on its own Render service, never resume the historical Dropso service. Build: `node --check scripts/telegram-relay.mjs`. Start: `node scripts/telegram-relay.mjs`. Confirm `/health` and log `relay_connectivity` show that Render can reach both Dropso and Telegram.
2. Apply `supabase/migrations/20261119131000_telegram_bonus_relay.sql` to the existing production database in one transaction. Then publish the primary application changes and verify `/health` on SpaceWeb.
3. Put a new random >=32-character secret into `DROPSO_RELAY_SECRET` in the Render dashboard and the same value into `BONUS_TELEGRAM_RELAY_SECRET` on SpaceWeb. Put `BONUS_TELEGRAM_BOT_USERNAME` on SpaceWeb. Keep the bot token on Render; do not publish any credentials. Render also requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (separate secret, >=32 characters), and `TELEGRAM_WEBHOOK_URL` (the service's HTTPS URL plus `/telegram-webhook`).
4. Start/redeploy the relay. It registers its own webhook only if an unrelated webhook will not be overwritten. Confirm log `relay_webhook_ready true` and the bot's channel administrator membership. Then load the VPS environment file with systemd and restart the primary service. Do not activate the relay on SpaceWeb until it is ready.
5. On `/bonuses`, authenticate via Twitch, generate a link, open the bot, subscribe if necessary, check subscription. Return to the site and confirm exactly 10 coins and the completed badge. Retrying or using another Dropso account with the same Telegram must never create another transaction.

The bot validates Telegram's webhook secret and uses a separate server-to-server shared secret. The token expires in ten minutes and is stored as a hash. Only the DB service role can execute the transaction; the wallet update and receipt are atomic. If the relay is temporarily unavailable, a user can retry or generate a new link. Disable the bonus by removing the relay environment variable from SpaceWeb and restarting; previously awarded coins stay intact.
