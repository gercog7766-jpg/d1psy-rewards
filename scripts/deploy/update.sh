#!/bin/bash
set -Eeuo pipefail
ROOT=/opt/dropso
STATE=/var/lib/dropso-deploy
BUILDER=dropso-build
NODE_BIN=/usr/bin/node
switching=0
candidate=''
old=''

log() { printf '[dropso-deploy] %s\n' "$*"; }
as_builder() { runuser -u "$BUILDER" -- env -i HOME="$STATE" PATH=/usr/local/bin:/usr/bin:/bin CI=true "$@"; }
link_to() { ln -sfn -- "$1" "$ROOT/current.next"; mv -Tf -- "$ROOT/current.next" "$ROOT/current"; }
healthy() {
 local expected
 expected=$(basename "$(readlink -f "$ROOT/current")")
 [[ $expected =~ ^[0-9a-f]{40}$ ]] || expected=''
 systemctl is-active --quiet dropso && curl --fail --silent --max-time 3 http://127.0.0.1:10000/health |
  "$NODE_BIN" -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{const data=JSON.parse(s);process.exit(data.ok===true&&(!process.argv[1]||data.release===process.argv[1])?0:1)}catch{process.exit(1)}})' "$expected"
}
wait_healthy() { local n; for n in {1..30}; do if healthy; then return 0; fi; sleep 1; done; return 1; }
rollback() {
 log "Restoring previous release: $old"
 systemctl stop dropso || return 1
 link_to "$old" || return 1
 systemctl start dropso || return 1
 wait_healthy || return 1
 switching=0
 log 'Previous release restored.'
}
on_exit() {
 local code=$?
 trap - EXIT
 set +e
 if ((switching)); then rollback || { log 'ROLLBACK FAILED: inspect journalctl -u dropso'; code=1; }; fi
 if ((code!=0)) && [[ $candidate =~ ^[0-9a-f]{40}$ ]]; then printf '%s\n' "$candidate" > "$STATE/failed-sha"; fi
 exit "$code"
}
prepare_release() {
 install -d -o "$BUILDER" -g "$BUILDER" -m 755 "$release"
 as_builder bash -c 'set -euo pipefail; git -C "$1" archive "$2" | tar -x -C "$3"' _ "$STATE/source" "$candidate" "$release"
 for command in 'npm ci --ignore-scripts' 'npm run typecheck' 'node scripts/deploy/checks.mjs' 'npm run build'; do
  # Fixed commands only, never application environment or production credentials.
  as_builder bash -c 'cd "$1"; exec bash -c "$2"' _ "$release" "$command"
 done
 test -f "$release/dist/server-entry.js"
 as_builder bash -c 'printf "%s\n" "$2" > "$1/.dropso-release"' _ "$release" "$candidate"
}
activate_release() {
 old=$(readlink -f "$ROOT/current")
 [[ -d $old && -f $old/dist/server-entry.js ]] || { log 'No valid rollback release'; return 1; }
 switching=1
 systemctl stop dropso
 link_to "$release"
 systemctl start dropso
 wait_healthy
 # Catch an immediate crash after the first successful HTTP response.
 for n in {1..3}; do sleep 2; healthy; done
 ln -sfn -- "$old" "$ROOT/previous"
 switching=0
 log "Activated $candidate"
}
is_root() { [[ $EUID == 0 ]]; }
main() {
 is_root || { log 'Run through the root-owned systemd service'; return 1; }
 exec 9>"$STATE/update.lock"
 flock -n 9 || { log 'Another deployment is already running'; return 0; }
 trap on_exit EXIT
 trap 'exit 130' INT
 trap 'exit 143' TERM
 as_builder git -C "$STATE/source" fetch --quiet --depth=1 origin main
 candidate=$(as_builder git -C "$STATE/source" rev-parse FETCH_HEAD)
 [[ $candidate =~ ^[0-9a-f]{40}$ ]] || return 1
 release="$ROOT/releases/$candidate"
 if [[ $(readlink -f "$ROOT/current") == "$release" ]]; then return 0; fi
 if [[ -f $STATE/failed-sha && $(cat "$STATE/failed-sha") == "$candidate" ]]; then log 'Previously rejected commit; waiting for a new commit or manual retry'; return 0; fi
 log "Preparing $candidate while the current site keeps running"
 # A previously interrupted build is never reused.
 rm -rf -- "$release"
 prepare_release
 activate_release
 rm -f "$STATE/failed-sha"
 # Retain current and previous only. Ignore any unexpected directory names.
 local path name
 for path in "$ROOT"/releases/*; do
  name=${path##*/}
  [[ $name =~ ^[0-9a-f]{40}$ ]] || continue
  [[ $path == "$release" || $path == "$old" ]] || rm -rf -- "$path"
 done
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
