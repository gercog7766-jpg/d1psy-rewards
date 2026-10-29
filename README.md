# d1psy Rewards

Independent Twitch giveaway service for d1psy. This repository is intentionally isolated from `d1psy-pickem`.

## Architecture

- Node.js + TypeScript + Express on Render Web Service
- Supabase project dedicated to Rewards
- Official Twitch OAuth for viewer identity
- Server-side database is the source of truth
- `/account` viewer cabinet, `/admin` owner UI, `/obs` OBS Browser Source

## Environment

Copy `.env.example` to `.env` for local development. Never commit real secrets.

Required server variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`, `SESSION_SECRET`, `ADMIN_TWITCH_USER_IDS`.

## Twitch Developer Console

Create a separate Twitch application for Rewards. Configure OAuth redirect URL as `https://d1psy-rewards.onrender.com/auth/twitch/callback`. The application must use official Twitch APIs/EventSub. Do not reuse or expose client secrets.

## Render

Build command: `npm install && npm run build`

Start command: `npm start`

Region: Frankfurt. Runtime: Node. The free Render tier can sleep and therefore is not suitable for strict always-on giveaway reliability; Twitch connection loss must be treated as a safe pause rather than silently selecting a winner.

## OBS

Add Browser Source URL: `https://d1psy-rewards.onrender.com/obs`. Browser reload never owns or resets giveaway state.

## Giveaway decisions

- Admin selects the prize for the next giveaway; prize selection is not random.
- One prize record is assigned once.
- Manual stop cancels the active round; restart creates a fresh round.
- Message-threshold overshoot is carried to the next round.
- Repeated winners are allowed.

## Status

Core schema, Twitch viewer OAuth, Trade URL profile, virtual inventory endpoints, admin shell and OBS shell are implemented. Twitch EventSub chat ingestion, transactional winner finalization, continuous automatic round rotation, SSE/WebSocket push, prize image upload UI and full admin UX remain implementation work before production giveaway use.
