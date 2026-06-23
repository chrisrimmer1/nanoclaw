import { execFile } from 'child_process';
import fs from 'fs';

import {
  ALERT_COOLDOWN_MS,
  ALERT_NOTIFY_BIN,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PATH,
} from './config.js';
import { logger } from './logger.js';

const lastAlertAt = new Map<string, number>();

/**
 * Send a Telegram ping via the `notify` CLI. De-duplicated per `key` within
 * ALERT_COOLDOWN_MS so a retry loop can't spam the phone. Best-effort and
 * fire-and-forget: failures are logged, never thrown back to the caller.
 */
export function sendAlert(key: string, message: string): void {
  const now = Date.now();
  const last = lastAlertAt.get(key) ?? 0;
  if (now - last < ALERT_COOLDOWN_MS) {
    logger.debug({ key }, 'Alert suppressed (within cooldown)');
    return;
  }
  lastAlertAt.set(key, now);
  execFile(ALERT_NOTIFY_BIN, ['--tag', 'nanoclaw', message], (err) => {
    if (err) {
      logger.warn({ err, key }, 'Failed to send alert via notify');
    }
  });
}

/** Test-only: clear the per-key cooldown state. */
export function _resetAlertState(): void {
  lastAlertAt.clear();
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function writeHeartbeat(): void {
  try {
    fs.writeFileSync(HEARTBEAT_PATH, String(Date.now()));
  } catch (err) {
    logger.warn({ err }, 'Failed to write heartbeat file');
  }
}

/**
 * Begin touching the heartbeat file on a timer so the external watchdog can
 * detect a dead or wedged host. Writes once immediately, then every
 * HEARTBEAT_INTERVAL_MS.
 */
export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  // The heartbeat alone should not keep the event loop alive.
  heartbeatTimer.unref?.();
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
