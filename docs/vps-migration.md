# Dropso VPS cutover

Target: `https://dropso.site`, VPS `193.232.89.37`, application `/opt/d1psy-rewards`.
The existing Supabase database stays in place. Do not restore or replace its data.

## Before starting

- Keep `/etc/dropso.env` outside the repository, root-owned with mode 600. Retain existing Supabase, Twitch, session and EventSub secrets.
- Set `APP_URL=https://dropso.site`, `TWITCH_REDIRECT_URI=https://dropso.site/auth/twitch/callback`, `PORT=10000`.
- Add the new OAuth callback to the same Twitch application; retain the Render callback through rollback validation.
- Update the trusted checkout and rebuild before cutover; restore ownership to the `dropso` service user afterwards. If maintaining this service-owned checkout as root, use a command-scoped `-c safe.directory=/opt/d1psy-rewards` for Git rather than a global wildcard exception. This release adds webhook migration and direct OBS links on the new domain.
- Verify the installed Node executable, systemd unit, Nginx certificate paths and proxy configuration before activation. Systemd reads the environment file; `npm start` by itself does not load it.
- The Node process runs its game, giveaway, streamer-series, vault and maintenance timers. `REWARDS_ENGINE_ENABLED=false` disables only the primary giveaway engine, not every writer. Do not use it as a general passive-staging switch.

## Cutover

Use one active application process against the production database. Stop/suspend Render and disable its auto-deploy before activating the VPS service. Do not run PM2 cluster mode or a second Node instance. Keep Render configuration for rollback.

Start the configured `dropso` systemd service, verify `/health` locally, activate the verified Nginx proxy, then verify HTTPS, Twitch login, inventory and wallet reads. Reconnect Twitch from the primary admin account; approved partner subscriptions are also checked by the server. Inspect the application journal for migration/connection errors.

On a 409 conflict, the new code inspects Twitch subscriptions and replaces only an exact matching channel/type webhook at `https://d1psy-rewards.onrender.com/eventsub/twitch`. Correct current/pending subscriptions are retained. An unrelated callback is never removed automatically. Override `TWITCH_LEGACY_EVENTSUB_CALLBACK` only for a known previous deployment. Chat, stream.online and stream.offline are supported.

On a custom HTTPS origin the dashboard generates `/streamer/obs?channel=...` links on that same origin. Existing OBS sources must have their URL changed manually. The independent relay's upstream must be updated separately after the new public widget API is verified; otherwise it still reads Render.

Verify time/message rounds, continuous renewal, stop/refunds, Twitch event reception and an OBS source. Monitor the systemd journal and enable the service at boot after validation.

For rollback, stop the VPS process before resuming Render. Restore Twitch webhook callbacks deliberately; never leave both engines running.
