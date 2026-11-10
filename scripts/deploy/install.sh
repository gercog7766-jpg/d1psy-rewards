#!/bin/bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root on the Dropso VPS'; exit 1; }
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for command in git npm node curl runuser flock systemctl; do command -v "$command" >/dev/null; done
[[ -f /etc/dropso.env && -f /opt/d1psy-rewards/dist/server-entry.js ]]
[[ $(systemctl show dropso -p User --value) == dropso ]] || { echo 'Unexpected dropso service user; stop and inspect the unit'; exit 1; }
[[ -x /usr/bin/node ]]
/usr/bin/node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22 || a===22&&b<1)process.exit(1)' || { echo 'Node 22.1 or newer is required'; exit 1; }
# The current installation listens on 10000. Refuse a mismatched setup before changing it.
port=$(sed -n 's/^PORT=//p' /etc/dropso.env | tr -d "\"'\r")
[[ ${port:-10000} == 10000 ]] || { echo 'Expected PORT=10000 in /etc/dropso.env'; exit 1; }
systemctl is-active --quiet dropso
curl --fail --silent --max-time 5 http://127.0.0.1:10000/health >/dev/null
systemctl stop dropso-update.timer 2>/dev/null || true
if systemctl is-active --quiet dropso-update.service; then systemctl start dropso-update.timer; echo 'An update is already running; try again after it finishes'; exit 1; fi
getent passwd dropso-build >/dev/null || useradd --system --user-group --home-dir /var/lib/dropso-deploy --shell /usr/sbin/nologin dropso-build
install -d -o dropso-build -g dropso-build -m 750 /var/lib/dropso-deploy
install -d -m 755 /opt/dropso /opt/dropso/releases /etc/systemd/system/dropso.service.d
if [[ ! -d /var/lib/dropso-deploy/source/.git ]]; then
 runuser -u dropso-build -- env -i HOME=/var/lib/dropso-deploy PATH=/usr/local/bin:/usr/bin:/bin git clone --quiet --depth=1 --branch main https://github.com/gercog7766-jpg/d1psy-rewards.git /var/lib/dropso-deploy/source
fi
install -o root -g root -m 755 "$HERE/update.sh" /usr/local/sbin/dropso-update
if [[ ! -L /opt/dropso/current ]]; then ln -s /opt/d1psy-rewards /opt/dropso/current; fi
cat > /etc/systemd/system/dropso.service.d/20-releases.conf <<'UNIT'
[Service]
WorkingDirectory=/opt/dropso/current
ExecStart=
ExecStart=/usr/bin/node /opt/dropso/current/dist/server-entry.js
UNIT
cat > /etc/systemd/system/dropso-update.service <<'UNIT'
[Unit]
Description=Build, test and deploy Dropso main with rollback
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/dropso-update
TimeoutStartSec=30min
TimeoutStopSec=5min
Nice=10
IOSchedulingClass=idle
UMask=0022
UNIT
cat > /etc/systemd/system/dropso-update.timer <<'UNIT'
[Unit]
Description=Check GitHub for Dropso updates every two minutes
[Timer]
OnActiveSec=15s
OnUnitInactiveSec=2min
AccuracySec=10s
Unit=dropso-update.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now dropso-update.timer
echo 'AUTOUPDATE ENABLED. First build/test runs in the background.'
echo 'Status: systemctl list-timers dropso-update.timer'
echo 'Logs: journalctl -u dropso-update -n 30 --no-pager'
