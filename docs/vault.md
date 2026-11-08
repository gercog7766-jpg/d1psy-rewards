# THE VAULT — operations and mechanics

## Launch

Player page: `/vault`; administration: `/admin/vault`. The account entry is above NIGHT SHIFT. Existing admin authentication protects fund/code controls; all user identities are taken from signed server sessions.

First season: 9 November 2026 00:00 through 15 November 2026 20:00 Europe/Moscow. The migration allocates and reserves 1,500 event coins, without debiting any player's wallet. Participation is free. Keys cannot be bought, transferred or converted into ordinary coins.

**Owner setup:** choose the season, save a secret four-digit code, and enable code entry when revealing it on stream. No code is preselected. Code entry additionally requires 1,300 contributed keys and an existing personal contribution. A correct code marks the shared puzzle solved; contributions continue until Sunday 20:00. Payout is at that deadline, not at code submission.

Working default: 50 earned keys per user per season. Admin can change the cap and reserved pool only before any keys have been earned. The four-digit code can be changed only while entry is disabled and it has not been solved. The code is HMAC-SHA256 hashed using SESSION_SECRET and season namespace before reaching PostgreSQL; APIs, audits and JS never expose its digest or plaintext. Rotating SESSION_SECRET requires resetting an unsolved season code.

## Earning and contributing

- First completed mini-game each Moscow day: +1 (win or loss; starting alone does not count). Supports Night Run, Minesweeper, Defuse, Wordle and completed two-player Tic-Tac-Toe.
- Each completed daily or weekly NIGHT SHIFT mission: +1. Challenges `allin`, `sniper`, `closecall` excluded.
- First giveaway victory per actual Twitch broadcast and channel: +1. Uses verified Twitch stream ID/start/end, not calendar day or round. Partner live awards count; promo awards do not count as giveaway wins.
- Each redeemed owner promo: +1, at most 10 per week. Partner `STR-` promos excluded.

Keys arrive in a separate seasonal wallet. Contributions debit that wallet and increment personal/shared totals atomically. Integer amounts only. Request UUIDs make retries safe. There is no user refund endpoint. Every source, rejected cap event, contribution and expiry is retained in private database history. Admin member pages show earned, remaining cap, balance, contribution and totals by each source.

Five sequential locks: Энергия 150, Шифр 200, Сигнал 250, Доступ 300, Ядро 400; total 1,300. Each has a separate state/progress indicator. The four-digit shared code is an additional final condition. Contributions above 1,300 remain allowed until the deadline and participate in the same proportional distribution.

## Settlement and reservation

At Sunday 20:00 Moscow, an event succeeds only if funded, at least 1,300 keys were contributed, and the code was accepted before the deadline. Otherwise it fails and pays nothing. Unspent keys expire in either outcome; old contributions remain historical only. All active locks/counters visually reset on closure. The gap until Monday 00:00 awards no keys. Each Monday has an independent season/wallet/code.

Share = personal contribution / total contributed. Whole coins are allocated by the largest remainder method: floor every exact share, then assign the remaining coins by descending fractional remainder. Equal fractions use first contribution timestamp then user UUID. No randomness or standings bonus; each allocation differs from its exact share by less than one coin and allocations sum to the reserved fund. A banned account's calculated share is forfeited to the event treasury, without increasing anyone else's share.

A successful payout creates ordinary coin transactions with a THE VAULT note. The season, payout snapshots and wallet credits commit in one database transaction. Repeating the settlement creates no duplicate credits. A failed transaction leaves everything retryable.

The private event treasury is an accounting allocation, not a real-money escrow or a player balance. Admin explicitly allocates future funds using the top-up form. Automatic season preparation can reserve 1,500 only when that allocation is available. It never silently creates additional weekly funding. Failed-season funds return to the treasury for reuse; successfully paid funds do not. A season without a reserved fund cannot accept contributions or award keys until funded.

## Execution, recovery and security

PostgreSQL cron `rewards-vault-weekly-engine` runs each minute: recover authoritative source records, reconcile broadcast wins, then process earnings/settlements. Deadlines are checked by every mutation using database time, so late requests are rejected even between cron ticks. Source triggers enqueue events without locking existing game/coin wallets. A nonblocking dedup advisory lock and bounded recovery scans handle simultaneous game completions without cross-feature lock cycles. Financial operations share a global Vault lock; personal key updates lock the relevant wallet.

The app polls Twitch Get Streams every 30 seconds and maintains verified stream.online/offline EventSub subscriptions, preserving chat subscriptions. EventSub HMAC and message age are checked by the existing webhook before recording events. Stream health is visible in admin. Missing or unverifiable broadcasts never fall back to granting a key each round/day. New stream IDs distinguish back-to-back broadcasts.

All Vault tables have RLS and no browser grants or policies. Only the server service role can invoke Vault functions. Admin status is checked again inside PostgreSQL. POST endpoints validate origin, JSON type, allowed fields, amounts and UUIDs. Code attempts are limited to 5 per user/10 minutes plus server/IP limits. Player state exposes only own wallet/history and public leaderboard names/contributions; it excludes private codes, hashes and other user IDs.

Database invariants: earned = balance + contributed + expired; pool = paid + refunded at settlement; treasury = allocations + refunds - reservations. Source uniqueness, contribution UUIDs and per-season payout keys prevent duplicates. Audit records contain no raw secret code. Historical records are retained instead of destructively deleting keys.

## Validation

Local PGlite exercises source triggers/backfill, caps, owner/partner promo filtering, actual-broadcast deduplication, nonce replay, code gating/throttling, exact Sunday boundary, payout rollback/retry, integer conservation, failed-season refund, Monday rollover, admin reservations/cap freeze and browser-role denial. HTTP/JSDOM tests cover signed identity, route access, CSRF/field rejection, code hashing, safe rendering, contribution retry and independent lock states. No fake production users, games, keys or payouts are created for testing.
