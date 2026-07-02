#!/usr/bin/env bash
# prune-container-images.sh — reclaim disk from superseded Apple `container`
# image layers.
#
# Every `container build` of nanoclaw-agent retags :latest and leaves the
# previous build's layers behind as dangling (untagged) images. Apple's
# `container` CLI has no automatic garbage collection, so these accumulate —
# on Chris's Mini they grew to ~20 GB (extracted rootfs snapshots) over a few
# months of rebuilds before a manual clean-up in July 2026.
#
# This prunes ONLY dangling images (`container image prune`, WITHOUT --all), so
# it never removes the live `nanoclaw-agent:latest` and is safe to run while
# agents are active. (`--all` would delete the tagged image whenever no agent
# happens to be running — do NOT use it here.)
#
# Runs weekly from launchd (com.nanoclaw.container-prune). Alerts Chris via the
# `notify` CLI on failure.
set -uo pipefail

CONTAINER="${CONTAINER_BIN:-/usr/local/bin/container}"
NOTIFY="${ALERT_NOTIFY_BIN:-$HOME/bin/notify}"
STORE="$HOME/Library/Application Support/com.apple.container"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

fail() {
  echo "[$(ts)] ERROR: $1" >&2
  [ -x "$NOTIFY" ] && "$NOTIFY" --tag nanoclaw "container image prune failed: $1"
  exit 1
}

command -v "$CONTAINER" >/dev/null 2>&1 || fail "container CLI not found at $CONTAINER"

before=$(du -sk "$STORE" 2>/dev/null | awk '{print $1}')

# Dangling-only prune: safe while agents run; leaves tagged images intact.
"$CONTAINER" image prune < /dev/null 2>&1 || fail "container image prune returned non-zero"

after=$(du -sk "$STORE" 2>/dev/null | awk '{print $1}')
if [ -n "${before:-}" ] && [ -n "${after:-}" ]; then
  freed_mb=$(( (before - after) / 1024 ))
  echo "[$(ts)] pruned dangling images: freed ${freed_mb} MB (store $((before/1024)) MB -> $((after/1024)) MB)"
else
  echo "[$(ts)] pruned dangling images (store size unavailable)"
fi
