#!/usr/bin/env bash
# macOS only. Launches Inkdrop with Chrome DevTools Protocol enabled.
set -euo pipefail

devtools_port="${INKDROP_DEVTOOLS_PORT:-9222}"
if [[ ! "$devtools_port" =~ ^[0-9]{1,5}$ ]] ||
  (( 10#$devtools_port < 1 || 10#$devtools_port > 65535 )); then
  printf 'INKDROP_DEVTOOLS_PORT must be an integer from 1 to 65535.\n' >&2
  exit 1
fi
devtools_port="$((10#$devtools_port))"

running_pids="$(pgrep -x Inkdrop || true)"
for pid in $running_pids; do
  if ! kill -TERM "$pid" 2>/dev/null && kill -0 "$pid" 2>/dev/null; then
    printf 'Could not send SIGTERM to Inkdrop (pid %s).\n' "$pid" >&2
    exit 1
  fi
done

quit_deadline=$((SECONDS + 20))
while pgrep -x Inkdrop >/dev/null; do
  if (( SECONDS >= quit_deadline )); then
    printf 'Inkdrop did not exit within 20 seconds after SIGTERM; relaunch aborted.\n' >&2
    exit 1
  fi
  sleep 1
done

open -na /Applications/Inkdrop.app --args "--remote-debugging-port=$devtools_port"
devtools_url="http://127.0.0.1:$devtools_port/json/version"
local_server_url="http://127.0.0.1:19840/"
ready_deadline=$((SECONDS + 60))

while (( SECONDS < ready_deadline )); do
  if curl --silent --fail --max-time 1 "$devtools_url" >/dev/null 2>&1 &&
    (( SECONDS < ready_deadline )); then
    local_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 1 "$local_server_url" 2>/dev/null)" || local_status=""
    case "$local_status" in
      2??|401)
        if new_pids="$(pgrep -x Inkdrop)"; then
          printf 'Inkdrop ready (pid: %s).\n' "$new_pids"
          printf 'DevTools: %s\nLocal note server: %s\n' "$devtools_url" "$local_server_url"
          exit 0
        fi
        ;;
    esac
  fi
  if (( SECONDS < ready_deadline )); then
    sleep 1
  fi
done

printf 'Inkdrop readiness timed out after 60 seconds. Expected %s and %s (HTTP 2xx or 401).\n' "$devtools_url" "$local_server_url" >&2
exit 1
