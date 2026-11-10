# Personal player statistics

`Статистика` is the first account logo-menu item, above `Баланс`; the same link moves into the mobile account menu. `/statistics` and `/api/me/statistics` require the existing signed session and respond with private/no-store cache headers. The only API parameter is a validated credit-history page. The server resolves the session's Twitch ID to its own user UUID; arbitrary user IDs/logins cannot be requested.

The service-only, stable invoker RPC `rewards_player_statistics` makes no wallet, game, XP or reward changes. It rejects banned/missing users and returns only explicit own-user aggregates. Browser roles cannot invoke it. Game boards, seeds, answers, puzzle state, trade links, other-player details and internal history IDs are excluded.

- The five mini-games show completed rounds and wins; unfinished rounds do not count. NIGHT RUN has distance records, not a win count. Tic-tac-toe requires an actual opponent; draws are part of completed games.
- NIGHT RUN historical distance is normalized using each version's established world-unit conversion. Record time belongs to that same longest run.
- Time records require a won game, a confirmed reward and valid start/finish timestamps. Wordly also requires timing eligibility; attempts belong to the fastest qualifying win. Minesweeper records show the board dimensions and mine count, since historical settings can differ.
- Wallet balance, positive credits and negative debits aggregate the entire ledger. Credits explicitly include gifts, manual allocations and refunds; they are not labelled pure game profit. History contains only positive credits, 20 per page, ordered by timestamp and UUID.
- Tournament totals/history include only positive prizes with a confirmed coin transaction. They do not include promised or uncredited results.
- The most-played game is based on completed game counts, with deterministic ties, rather than a claimed personal preference.

A partial index on paid tournament results supports own-user history. Existing game and ledger user indexes are reused. Tests cover more than 1,000 ledger records, other-user isolation, incomplete/invalid records, unpaid tournament exclusions, zero accounts, bans, browser-role denial, session binding, safe rendering, pagination, error recovery and desktop/mobile menu placement. No real production games or credits are generated for testing.

## Personal economy story

`rewards_player_economy(uuid)` adds read-only analytics without changing the original RPC or its history contract. Apply `20261110220701_player_economy_story.sql` and `20261110222624_player_story_visible_shop.sql` before deploying the application. It uses security invoker, an empty search path and service_role-only execution; existing user/time indexes are reused. It writes no coins, XP, game data, suggestions status or rewards.

Today, seven calendar days, thirty calendar days, current calendar month, previous calendar month and all time are defined in Europe/Moscow. Each period reconciles positive credits minus absolute debits to its net change. The chart displays up to the last thirty calendar days in that period, including zero-activity days. Credits include refunds, gifts and manual allocations, so they are labelled credits rather than pure earned game income.

Game credits use confirmed transaction IDs from game records, legacy NIGHT RUN rewards and paid weekly results. Stream awards use actual giveaway wins/partner round awards and their coin transactions or completed item sales; promo credits remain separate. An unexchanged skin is counted as a prize, not invented coin income. Existing authoritative transaction types/known server note formats identify purchases, profile cosmetics, gifts, season/referral/daily/promo rewards, word fees/refunds/prizes and upgrader coin supplements. Unproven historical sources stay Other; no arbitrary note text is guessed to be a game reward.

Word counts include paid unique checks, wins and incorrect checks. The displayed failed-check cost excludes refunded attempts using their current refund status. It is not labelled the account's overall loss: winning rewards and item purchases are separate. The optional shop comparison uses only this failed-check budget, currently available positive-priced items/variants and actual stock. Known hidden names from the existing storefront, sold-out parents, unavailable variants and fallback parent prices when variants exist are excluded. It is a comparison with current catalogue prices, not a promise of stock or a claim about historic pricing.

Comments are deterministic rules over the selected period. Gentle is the default; Sharp and Off are local, per-login preferences. Purchases/gifts/refunds are not called lost bets. Monthly cards show credits, debits, net, word results and stream prize counts; copy/share is an explicit local user action with a manual-copy fallback, never an automatic publication or public profile export.

The API still validates the signed actor and checks the current user/ban state on every request. Base history pages and the per-user economy snapshot are cached/coalesced for 30 seconds in bounded per-client process maps. No errors are cached; snapshots are cloned before returning. Economy data is reused when paginating credits. These caches do not affect authoritative wallets or gameplay APIs. The UI shows snapshot time, preserves confirmed values on errors and handles accounts without analytics during rollout.
