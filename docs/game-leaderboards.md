# Current weekly tournaments

From 9 November 2026, public tables use weekly Moscow periods and automatic prizes. See [weekly-game-prizes.md](weekly-game-prizes.md). The description below records the original timed leaderboard behavior; its all-time range and current-settings filtering were superseded by the weekly implementation.

# Timed game leaderboards and Night Run start window

Night Run: a new game can start once per four hours, measured from its server `started_at`. Both legacy and v2 RPCs share the same user lock/window and remain replay-safe. Existing active runs resume rather than consume a second attempt. Stops, crashes, abandoned tabs and different request IDs cannot reset the window. The database insert trigger also enforces it. State exposes `nextAvailableAt`; the UI shows a countdown and re-enables start when it expires. Existing in-flight runs and earned coins are retained.

Authenticated `/api/me/game-leaderboard` exposes top ten winners, one best result per non-banned player. Modes are isolated: Minesweeper easy/medium/hard, Defuse rookie/swat/expert; Wordly has one all-time table. Ranking is elapsed server milliseconds ascending, then Wordly guesses ascending, completion timestamp and stable key. Only public name/login, rank, elapsed time, attempts and viewer flag leave the database. No game IDs, user IDs, seeds, mines, puzzles or word answers are exposed. The RPC is invoker and service-role only.

Minesweeper records match the current mode's width, height, mine count and time limit, so earlier easier configurations cannot dominate a harder board. Mode selectors remain usable during cooldown for browsing records; starting a new game is still unavailable. Existing active-game mode locking remains unchanged. Defuse uses its existing mode selection. Every mode change refreshes the table; out-of-order responses cannot restore a previous mode's results.

Wordly starts its server clock when the game state is opened. The existing daily answer is retained on repeated starts and guesses. Start/finish timestamps persist across reloads, tabs and pauses. A before-write trigger freezes finish on a win or sixth guess. Existing untimed records and requests from old clients that guess without opening a timed game stay playable/rewardable, but are explicitly ineligible for timed records. No historical elapsed times are invented, and no historical rewards are issued. The public response reveals only clock metadata until the existing game-completion answer reveal.

Tables sit left on wide desktops and below the game on narrow screens; Wordly columns are Name / Time / Attempts. Tables refresh on visible pages every 15 seconds and after confirmed wins. All dynamic names use text nodes, errors are visible/retryable, and prior rows are kept only when refreshing the same mode. Game actions, coin rewards, attempts and other cooldowns are preserved.

Validation covers database replay/timing/privacy, old/new Night Run clients, timer recovery, mode/config isolation, one record per player, ten-record cap, banned accounts, actor-bound HTTP requests, client time-forgery rejection, race-safe UI refreshes, mode selectors, Wordly input/timer behavior and the existing game integrations. Physical mobile/browser visual review is not available in this environment.
