# Minesweeper

`/games/minesweeper` is a classic 10×10 field with open, flags, zero-region flood and number chording. The first opened cell and its neighbors are safe. Easy games last 3:00, medium 4:00, and hard 5:30 from starting the attempt. Server deadlines survive reloads and are checked before moves/rewards; running out of time loses the attempt. The third timeout starts cooldown at the deadline, even if the user returns much later. Desktop supports right-click flags; mobile has an explicit flag mode. A two-step surrender consumes the current attempt.

One account has three attempts shared across all difficulties. Winning any attempt pays exactly once and ends the cycle immediately. Winning or losing the third attempt starts a rolling 12-hour cooldown at completion. Earlier losses allow the next attempt immediately. Refreshing, changing difficulty or using another tab never resets attempts; active parties resume. The next cycle starts only after cooldown expiry.

Defaults: easy 10 mines / 5 coins, medium 15 / 15, hard 20 / 25. `/admin/minesweeper` allows admins to set 1–80 mines independently per difficulty. Size and rewards remain fixed. New games snapshot settings; active games are unaffected by later edits.

All mines, moves, adjacency, completion and rewards are computed in Postgres. Active DTOs expose only opened numbers and flags; mine positions appear only after completion. Client-supplied boards/results/rewards are rejected. All tables use RLS and deny anon/authenticated access; invoker RPCs use an empty search path and service-role-only execution. The API derives the account from its signed session and checks admin authorization, same-origin JSON writes, schemas and a per-user move rate limit.

User-row locks serialize attempts, game moves and wallet credits consistently with other coin operations. A game version prevents stale moves; the latest request receipt supports lost-response retries. Terminal games cannot pay again or extend cooldown. GET state has no-store caching and can reset an expired cycle. Pending client requests disable further moves; a state response predating a local action is ignored.

Validation uses isolated PGlite fixtures and the real Express entry point behind mock PostgREST. Coverage includes first-click safety, corner adjacency, hidden mines, flood/chord (including incorrect flags), settings snapshots, cross-difficulty attempts, first-attempt wins, third losses, cooldown expiry, concurrent starts, one-time rewards, replay/stale requests, ownership/bans/direct grants, mobile flag controls, reload persistence and response-loss retry. No real user games or balances are used for testing. Responsive layout is verified structurally; no real-device visual verification is claimed.

## Настраиваемые поле и время

Для каждой сложности администратор задаёт ширину/высоту 5–25, мины от 1 до площади минус 9 и время 1–3600 секунд. Новые игры сохраняют снимок всех параметров; существующие партии сохраняют прежний дедлайн и поле 10×10. Награды 5/15/25 и общий цикл трёх попыток/12 часов неизменны. На телефоне крупное поле прокручивается по горизонтали, клетки не уменьшаются ниже 28px. Размер хранится в игре и участвует в SQL-проверках границ, генерации мин, соседях, flood/chord и условии победы. Клиент не получает скрытые мины.

Миграция `20261107152707_minesweeper_board_and_time_settings.sql` сохраняет старую configure-сигнатуру для совместимости и добавляет новую service-only с полными настройками. Новые тесты покрывают 625 клеток/индекс 624, прямоугольное поле, запрет выхода за границы, снимки старых игр, свой дедлайн, одно начисление и запрет anon; HTTP/DOM проверяет сохранение 25×25 и времени через админку.

## Оптимизация интерфейса

Поле создаётся один раз на партию/размер. Серверный ответ обновляет только изменившиеся клетки; обработчики открывания и флагов делегированы полю. Во время запроса действия заблокированы, повтор сохраняет прежний requestId. Повторные загрузки и изменение размеров не пересоздают 625 кнопок. Изменения размеров сгруппированы с задержкой 100 мс.
