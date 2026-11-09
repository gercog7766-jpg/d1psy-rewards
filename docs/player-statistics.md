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
