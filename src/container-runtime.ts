/**
 * Container runtime abstraction for NanoClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

import { logger } from './logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'container';

/**
 * Apple Container's default-network metadata, populated by
 * `ensureContainerRuntimeRunning()` after the runtime is confirmed up. All
 * accessors that need the bridge gateway or subnet go through `appleNetwork()`,
 * which throws if called before initialization.
 */
let _appleNetwork: { ipv4Gateway: string; ipv4Subnet: string } | null = null;

function inspectAppleContainerNetwork(): {
  ipv4Gateway: string;
  ipv4Subnet: string;
} {
  let json: string;
  try {
    json = execSync('container network inspect default', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } catch (err) {
    throw new Error(
      `Failed to inspect Apple Container default network: ${(err as Error).message.trim()}. ` +
        `NanoClaw needs this to determine the bridge gateway IP. ` +
        `Ensure the runtime is healthy: 'container system status' / 'container network ls'.`,
    );
  }
  const parsed = JSON.parse(json) as Array<{
    status?: { ipv4Gateway?: string; ipv4Subnet?: string };
  }>;
  const status = parsed[0]?.status;
  if (!status?.ipv4Gateway || !status?.ipv4Subnet) {
    throw new Error(
      `Apple Container default network did not report ipv4Gateway and ipv4Subnet. ` +
        `Raw output: ${json.trim()}`,
    );
  }
  return { ipv4Gateway: status.ipv4Gateway, ipv4Subnet: status.ipv4Subnet };
}

function appleNetwork(): { ipv4Gateway: string; ipv4Subnet: string } {
  if (!_appleNetwork) {
    throw new Error(
      'Apple Container network not initialized — ensureContainerRuntimeRunning() must be called first',
    );
  }
  return _appleNetwork;
}

/** Test-only: clear cached Apple Container network state between tests. */
export function __resetAppleNetworkForTests(): void {
  _appleNetwork = null;
}

/**
 * IP containers use to reach the host machine.
 * Apple Container: the default network's bridge gateway IP (e.g. 192.168.64.1).
 * Docker Desktop (macOS/Windows): host.docker.internal resolves automatically.
 * Docker (Linux): host.docker.internal added via --add-host in hostGatewayArgs().
 */
export function getContainerHostGateway(): string {
  if (CONTAINER_RUNTIME_BIN === 'container') return appleNetwork().ipv4Gateway;
  return 'host.docker.internal';
}

/**
 * Address the credential proxy binds to.
 * Apple Container (macOS): 0.0.0.0 — bridge100 doesn't exist until the first
 *   container starts, so we can't bind to the gateway IP directly. Access is
 *   gated by getProxyAllowedCidr() (loopback + container subnet).
 * Docker Desktop (macOS): 127.0.0.1 — the VM routes host.docker.internal to loopback.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 *   falling back to 0.0.0.0 if the interface isn't found.
 */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') {
    if (CONTAINER_RUNTIME_BIN === 'container') return '0.0.0.0';
    return '127.0.0.1';
  }

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
  // Check /proc filesystem, not env vars — WSL_DISTRO_NAME isn't set under systemd.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  // Bare-metal Linux: bind to the docker0 bridge IP instead of 0.0.0.0
  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}

/**
 * CIDR that the credential proxy will accept requests from (in addition to
 * loopback). Only set when binding wide (Apple Container path). Undefined
 * means no source filtering (binds are already restrictive).
 */
export function getProxyAllowedCidr(): string | undefined {
  if (CONTAINER_RUNTIME_BIN === 'container') return appleNetwork().ipv4Subnet;
  return undefined;
}

/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // Apple Container: we pass the gateway IP directly in ANTHROPIC_BASE_URL,
  // no hostname mapping needed.
  if (CONTAINER_RUNTIME_BIN === 'container') return [];
  // On Linux Docker, host.docker.internal isn't built-in — add it explicitly
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return [
    '--mount',
    `type=bind,source=${hostPath},target=${containerPath},readonly`,
  ];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} system status`, { stdio: 'pipe' });
    logger.debug('Container runtime already running');
  } catch {
    logger.info('Starting container runtime...');
    try {
      execSync(`${CONTAINER_RUNTIME_BIN} system start`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      logger.info('Container runtime started');
    } catch (err) {
      logger.error({ err }, 'Failed to start container runtime');
      printRuntimeFatalAndThrow();
    }
  }

  // Runtime is up — populate network metadata. Hard-fails if Apple Container
  // can't report ipv4Gateway/ipv4Subnet; we have no fallback worth guessing.
  if (CONTAINER_RUNTIME_BIN === 'container' && !_appleNetwork) {
    _appleNetwork = inspectAppleContainerNetwork();
    logger.info(_appleNetwork, 'Apple Container network discovered');
  }
}

function printRuntimeFatalAndThrow(): never {
  console.error(
    '\n╔════════════════════════════════════════════════════════════════╗',
  );
  console.error(
    '║  FATAL: Container runtime failed to start                      ║',
  );
  console.error(
    '║                                                                ║',
  );
  console.error(
    '║  Agents cannot run without a container runtime. To fix:        ║',
  );
  console.error(
    '║  1. Ensure Apple Container is installed                        ║',
  );
  console.error(
    '║  2. Run: container system start                                ║',
  );
  console.error(
    '║  3. Restart NanoClaw                                           ║',
  );
  console.error(
    '╚════════════════════════════════════════════════════════════════╝\n',
  );
  throw new Error('Container runtime is required but failed to start');
}

/** Kill orphaned NanoClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    const output = execSync(`${CONTAINER_RUNTIME_BIN} ls --format json`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    const containers: { status: string; configuration: { id: string } }[] =
      JSON.parse(output || '[]');
    const orphans = containers
      .filter(
        (c) =>
          c.status === 'running' && c.configuration.id.startsWith('nanoclaw-'),
      )
      .map((c) => c.configuration.id);
    for (const name of orphans) {
      try {
        execSync(stopContainer(name), { stdio: 'pipe' });
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
