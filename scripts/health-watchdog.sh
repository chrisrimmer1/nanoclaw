#!/usr/bin/env bash
# health-watchdog.sh — external NanoClaw liveness check (macOS).
#
# Pings Chris via `notify` if NanoClaw is down or wedged. Runs from launchd
# every few minutes, INDEPENDENTLY of NanoClaw, so it still fires when the host
# process is fully dead. Liveness is judged from the heartbeat file the host
# touches every minute (covers both "process gone" and "process hung" — a
# wedged process stops updating the heartbeat too).
#
# Overridable via env (set in the launchd plist):
#   NANOCLAW_HEARTBEAT  path to the heartbeat file
#   ALERT_NOTIFY_BIN    path to the notify CLI
#   STALE_THRESHOLD     seconds before a heartbeat counts as stale (default 300)
#   ALERT_COOLDOWN      seconds between repeat down-alerts (default 1800)
set -uo pipefail

HEARTBEAT_FILE="${NANOCLAW_HEARTBEAT:-$HOME/python_projects/nanoclaw/data/.heartbeat}"
NOTIFY="${ALERT_NOTIFY_BIN:-$HOME/bin/notify}"
STALE_THRESHOLD="${STALE_THRESHOLD:-300}"
ALERT_COOLDOWN="${ALERT_COOLDOWN:-1800}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/nanoclaw"
STATE_FILE="$STATE_DIR/watchdog-state"
mkdir -p "$STATE_DIR"

now=$(date +%s)

# --- assess health from the heartbeat file ---------------------------------
# The host writes epoch-milliseconds (Date.now()) as the file content on every
# beat. Judge liveness from that content, not the file mtime: the content is the
# host's explicit "I was alive at T" signal and survives any incidental touch.
status="ok"
reason=""
if [[ ! -f "$HEARTBEAT_FILE" ]]; then
  status="down"
  reason="heartbeat file missing"
else
  hb_ms=$(tr -dc '0-9' < "$HEARTBEAT_FILE" 2>/dev/null)
  if [[ -z "$hb_ms" ]]; then
    status="down"
    reason="heartbeat unreadable"
  else
    age=$(( now - hb_ms / 1000 ))
    if (( age > STALE_THRESHOLD )); then
      status="down"
      reason="no heartbeat for ${age}s"
    fi
  fi
fi

# --- previous state (timestamp + status) -----------------------------------
last_ts=0
last_status="ok"
if [[ -f "$STATE_FILE" ]]; then
  read -r last_ts last_status < "$STATE_FILE" || true
  [[ "$last_ts" =~ ^[0-9]+$ ]] || last_ts=0
fi

notify() { "$NOTIFY" --tag nanoclaw "$1" 2>/dev/null || true; }

if [[ "$status" == "down" ]]; then
  # Alert on first detection, or once per cooldown while it stays down.
  if [[ "$last_status" != "down" ]] || (( now - last_ts >= ALERT_COOLDOWN )); then
    notify "NanoClaw appears DOWN: ${reason}. (host on $(hostname -s))"
    echo "$now down" > "$STATE_FILE"
  fi
else
  # Recovered: tell Chris once, on the down -> ok transition.
  if [[ "$last_status" == "down" ]]; then
    notify "NanoClaw recovered - heartbeat fresh again."
  fi
  echo "$now ok" > "$STATE_FILE"
fi
