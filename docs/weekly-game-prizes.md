# Weekly game tournaments

Launch: **9 November 2026 00:00 Europe/Moscow**. No contests or awards precede this date. First period: 9–15 November; first payout after closure, 16 November. The database uses half-open `[Monday 00:00, next Monday 00:00)` windows, including all of Sunday 23:59:59.999999. UI shows Sunday 23:59:59.

| Game/category | First | Second | Third |
|---|---:|---:|---:|
| Night Run | 15 | 10 | 5 |
| Wordly | 20 | 10 | 5 |
| Minesweeper easy | 10 | 0 | 0 |
| Minesweeper medium | 20 | 0 | 0 |
| Minesweeper hard | 30 | 0 | 0 |
| Defuse rookie | 10 | 0 | 0 |
| Defuse swat | 20 | 0 | 0 |
| Defuse expert | 30 | 0 | 0 |

Each table shows ten players, one best eligible result per player. Games must start and complete within the period. Night Run sorts distance descending, then simulation duration ascending. Winning timed games sort elapsed server milliseconds, then guesses for Wordly, completion timestamp, user ID and stable record key. Banned players, losses, unpaid puzzle wins and untimed Wordly records are excluded. There are no invented winners for empty or partially filled tables. A player may win in several categories.

Minesweeper records its validated configuration at completion: changing settings later cannot invalidate a legitimate earlier result. No pre-launch history is rewritten. The game UI's older reference to matching only current settings is replaced by the selected difficulty description.

Night Run records terminal time in a private before-write trigger. An inactive pending run is effectively completed at last server heartbeat + 8 seconds, so a delayed expiry worker cannot move a result to the next week. An active run crossing the boundary is not eligible for either week. Coins collected/cashed out during the run remain independent of tournament bonuses.

`rewards_game_week_rankings(date)` is the common ranking source for live tables and settlement. `rewards_game_week_public` returns only public names, scores, timing, placement, prize and period metadata. User/game secrets do not leave the database. Existing authenticated leaderboard routes continue to work.

`rewards_game_week_settle()` takes a transaction-scoped advisory lock, processes at most four overdue weeks, freezes top-ten snapshots in `rewards_game_week_results`, posts positive ordinary-wallet adjustment transactions and marks the week settled in the same transaction. Payment failure rolls everything back. Repeated and overlapping invocations cannot pay twice. Rows carry unique week/game/category/rank and recipient keys and a unique ledger transaction ID. Users are locked in a stable order, and bans are rechecked before payment. No browser can choose the week, winner or amount.

The existing Supabase pg_cron runs settlement every minute. It waits at least 15 seconds after the boundary for final Night Run heartbeat expiries, so the normal payout is around 00:01 Monday Moscow. Delays retry automatically; downtime catches up. RLS and browser-role REVOKEs protect snapshots, functions and the server clock. No account balances are debited. An additional scheduled check may invoke the same idempotent function as a recovery action.

Tests use a local PGlite-only clock replacement to cover prelaunch, Monday/Sunday boundaries, ranking, all eight categories, exact 185-coin maximum allocation with sufficient players, payout rollback/retry, empty weeks, stable ties, privacy and eligibility. No production games, fake users or prize transactions are created for testing.

# IEM archive

At **8 November 2026 23:59 Europe/Moscow** (`20:59Z`), only `IEM Beijing` disappears from the public predictions list. Its tab hides and an already-open IEM tab switches to BLAST. BLAST data, fixtures, claims and administration are unchanged. IEM rows and prediction/claim history remain in the database and admin. The archive is a clock-based server filter, so it does not require a deploy at the deadline. Existing claim RPCs remain intact. Tests cover the exact boundary and keyboard navigation.
