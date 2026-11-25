# Closed Telegram Stars sandbox

This is an opt-in ADMIN TEST adapter for the Telegram test network. It does not change the existing production bot, its webhook, bonus relay, real balances or user entitlements. No migration is required after the previous test ledger migration.

Telegram's test network is separate: a regular production BotFather token does not work there. See https://core.telegram.org/bots/features#dedicated-test-environment. Create a test account and test bot only if end-to-end Telegram testing is approved. The official API endpoint used by this adapter is always `/test/`.

The optional adapter runs only with the following server environment configuration (never paste tokens into chat or commit them):

- `DROPSO_STARS_SANDBOX_ENABLED=true`
- `DROPSO_STARS_SANDBOX_TOKEN`: separate test BotFather token
- `DROPSO_STARS_SANDBOX_ACTOR`: existing administrator Twitch ID (verified by the database on each action)
- `DROPSO_STARS_SANDBOX_TELEGRAM_ID`: ID of the authorized **test-network** Telegram account

Leave the switch off until the test environment is configured and connectivity is verified. Production Telegram credentials must not be used. The server must reach the official Telegram test API; if the VPS has no connectivity, do not change the existing production relay or transfer the database credential to a third-party service to work around this. Plan a separately authorized test relay instead.

Use a private chat with the test bot: `/start`, `/lite`, `/plus`, `/pass`. Enable ADMIN TEST for the relevant draft first. Test invoices use XTR, exact saved prices, existing admin test orders and test-only charge records. The web admin test ledger shows the resulting state. Refund buttons in the admin ledger simulate a refund of the preview only; they do not initiate a Telegram refund. No real checkout or cosmetic grants exist in this release.
