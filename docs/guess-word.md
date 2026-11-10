# Угадай слово

Standalone site game at `/games/guess-word`, managed by the primary founder at `/admin/guess-word`. A game card is included only in Games. The account page has no game teaser or game polling script. No Twitch connection, stream event, Wordle feedback or automatic next round is involved.

The administrator chooses a 2–24-letter Russian or English word, hint (180 characters maximum), attempt fee (1–10,000 personal coins), and either a coin reward (1–1,000,000) or a skin from the existing prize catalogue. One round can be active globally. New words are manually configured; active words/prices/prizes cannot be edited.

Every unique valid check, including the winning check, is paid. Guesses are case-insensitive, trimmed and Е/Ё-equivalent. No matching letters or positions are returned. The last 20 distinct incorrect words are displayed globally; all previous words are retained for duplicate detection. Duplicate words, invalid lengths, insufficient balance and requests arriving after closure do not cost coins.

All attempts serialize on the round and use the existing user row lock for the personal wallet. Debit, attempt, award and closure happen in one PostgreSQL transaction. The first correct accepted guess wins; a different actor arriving later is not charged. Request UUIDs are bound to actor/round/normalized guess so response-loss retries cannot double charge or award. The client retains a retry UUID after a network failure and prevents overlapping clicks/polls from replacing its state.

Coin rewards are issued to the personal ledger as an administrator-configured game reward, not taken from streamer wallets. They do not match referral signup reward qualification patterns. A skin selection creates a dedicated disabled prize snapshot reserved for this game; the source prize and shop stock remain unchanged. It is an administrator commitment to deliver that skin, not an automatic supplier purchase or warehouse stock reservation. On victory a normal `rewards_wins` inventory item is created with source `guess_word`, without a giveaway round ID. Existing claim/sale/delivery flows apply. No stream reward settings or game cooldowns change.

Cancelling an active round locks it, refunds each participant's actual paid attempts and marks them refunded in the same transaction. Repeated cancellation is idempotent; a won round cannot be cancelled/refunded. Cancelled answers stay hidden from players. The admin sees the last ten rounds, words, prize, attempts and spent coins (excluding refunds), plus a searchable prize list limited to 50 results.

Tables have RLS and no browser-role grants. Normalization/state/RPC functions are security invoker with a fixed search path, executable only by service_role. The HTTP server derives actor identity from its signed session, validates exact payload keys and types, checks write origin, sets private/no-store responses and rate-limits polling/mutations. Admin authorization is rechecked in SQL against the immutable primary streamer identity. Restricted accounts may view the puzzle with `canPlay:false` but cannot submit paid attempts; banned accounts cannot read state. The player DTO never includes an active/cancelled answer, partial feedback, admin payload or another player's balance.

## Installation and verification

Apply `20261110203712_guess_word_game.sql` and `20261110205013_guess_word_readonly_spectators.sql` to the existing database before the application deployment. It adds only the new game's tables/functions/permissions and creates no rounds, charges, prizes or payouts. The existing VPS auto-updater installs the merged application after its checks; do not start a second production engine or resume Render.

Run `npm run typecheck`, `npm run build`, and `node --import tsx --test --test-concurrency=1 tests/guess-word-db.test.mjs tests/guess-word-http-ui.test.mjs`. The full deployment gate is `node scripts/deploy/checks.mjs` (the three previously documented paused-feature legacy cases remain excluded). Tests use PGlite/local mock services, never live user balances. They cover hidden DTOs, paid/duplicate/retry behavior, 20-word history, fees/rewards, winner serialization, restrictions, atomic failure rollback, refunds, skin inventory, RLS/role denial, authenticated HTTP and the real app navigation, plus player/admin DOM behavior and safe text.

After deployment verify `/health.release`, the static game script and unauthenticated 401 responses. The founder creates the first real round through the new panel; deployment itself never starts a paid round.
