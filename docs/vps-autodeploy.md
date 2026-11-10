# Automatic VPS updates

One-time installation as root on the existing VPS:

```bash
git -c safe.directory=/opt/d1psy-rewards -C /opt/d1psy-rewards pull --ff-only origin main
bash /opt/d1psy-rewards/scripts/deploy/install.sh
```

The installer keeps `/etc/dropso.env` unchanged and creates a root-owned updater, a dedicated unprivileged `dropso-build` account and a systemd timer. No GitHub secret, inbound webhook or additional application instance is needed. The source repository is public. Render must stay suspended.

The timer checks `main` two minutes after each completed check. A changed commit is archived into a separate release directory. Dependencies (`npm ci --ignore-scripts`), type checking, the serial deployment test gate and the build run as `dropso-build`, without the production environment. The running site stays on the old release while these checks execute. A failed gate never stops it.

The test gate runs all files from `npm test` with concurrency one. Three exact legacy integration test names expecting the intentionally paused Live/Contracts features are excluded and listed in `scripts/deploy/checks.mjs`. Their DB/UI tests, plus the dedicated paused-features tests, still run. This is explicit technical debt, not a generic ignore-failures mechanism; all other failures block deployment.

After passing checks, the updater stops the sole `dropso` application process, atomically switches `/opt/dropso/current`, starts the service, and checks HTTP `/health`, its expected public commit SHA and systemd state. A failed start, health check or catchable interruption restores the previous release and starts it again. A successful update has a brief restart interruption. A database migration is never applied or reverted by this updater; incompatible data/schema changes still require a separate coordinated rollout. Health checks confirm startup, not every site function.

The first `current` points at the existing `/opt/d1psy-rewards`, providing rollback for the initial deployment. Later updates keep current and previous release directories, removing older releases only after success. A failed SHA is recorded and will not repeatedly rebuild/restart the site; a new commit is tried automatically. Root-owned updater/unit changes require rerunning the installer; future application updates do not.

## Status and troubleshooting

```bash
systemctl list-timers dropso-update.timer
journalctl -u dropso-update -n 80 --no-pager
readlink -f /opt/dropso/current
curl --fail --silent http://127.0.0.1:10000/health
systemctl is-active dropso
```

The installer confirms only that scheduling is enabled. Confirm the first automatic release with `Activated <SHA>` in the update journal and `active` for Dropso. Builds/tests may take several minutes, depending on VPS resources.

To pause future automatic updates (a running build is allowed to finish):

```bash
systemctl stop dropso-update.timer
```

To retry a rejected commit after resolving a resource/network problem:

```bash
rm -f /var/lib/dropso-deploy/failed-sha
systemctl start dropso-update.service
```

Use this only after checking the failure log; code/test failures should be fixed with a new commit.

## Manual rollback

Stop scheduling and wait for any active updater to finish before switching versions:

```bash
systemctl stop dropso-update.timer
flock /var/lib/dropso-deploy/update.lock bash -e -c '
  previous=$(readlink -f /opt/dropso/previous)
  test -f "$previous/dist/server-entry.js"
  systemctl stop dropso
  ln -sfn "$previous" /opt/dropso/current.next
  mv -Tf /opt/dropso/current.next /opt/dropso/current
  systemctl start dropso
  systemctl is-active dropso
'
```

Verify `/health` and investigate before re-enabling the timer. This rollback changes code only, never Supabase data.
