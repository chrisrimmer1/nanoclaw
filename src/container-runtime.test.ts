import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock child_process — store the mock fn so tests can configure it
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

import {
  CONTAINER_RUNTIME_BIN,
  readonlyMountArgs,
  stopContainer,
  ensureContainerRuntimeRunning,
  cleanupOrphans,
  __resetAppleNetworkForTests,
} from './container-runtime.js';
import { logger } from './logger.js';

// Sample `container network inspect default` payload used to satisfy the
// network-metadata lookup that ensureContainerRuntimeRunning() performs.
const NETWORK_INSPECT_OUTPUT = JSON.stringify([
  { status: { ipv4Gateway: '192.168.64.1', ipv4Subnet: '192.168.64.0/24' } },
]);

beforeEach(() => {
  vi.clearAllMocks();
  __resetAppleNetworkForTests();
});

// --- Pure functions ---

describe('readonlyMountArgs', () => {
  it('returns --mount flag with type=bind and readonly', () => {
    const args = readonlyMountArgs('/host/path', '/container/path');
    expect(args).toEqual([
      '--mount',
      'type=bind,source=/host/path,target=/container/path,readonly',
    ]);
  });
});

describe('stopContainer', () => {
  it('returns stop command using CONTAINER_RUNTIME_BIN', () => {
    expect(stopContainer('nanoclaw-test-123')).toBe(
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-test-123`,
    );
  });
});

// --- ensureContainerRuntimeRunning ---

describe('ensureContainerRuntimeRunning', () => {
  it('does nothing when runtime is already running, then inspects network', () => {
    mockExecSync.mockReturnValueOnce(''); // system status
    mockExecSync.mockReturnValueOnce(NETWORK_INSPECT_OUTPUT); // network inspect

    ensureContainerRuntimeRunning();

    expect(mockExecSync).toHaveBeenCalledTimes(2);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      1,
      `${CONTAINER_RUNTIME_BIN} system status`,
      { stdio: 'pipe' },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      'container network inspect default',
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Container runtime already running',
    );
    expect(logger.info).toHaveBeenCalledWith(
      { ipv4Gateway: '192.168.64.1', ipv4Subnet: '192.168.64.0/24' },
      'Apple Container network discovered',
    );
  });

  it('auto-starts when system status fails, then inspects network', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('not running');
    }); // system status fails
    mockExecSync.mockReturnValueOnce(''); // system start succeeds
    mockExecSync.mockReturnValueOnce(NETWORK_INSPECT_OUTPUT); // network inspect

    ensureContainerRuntimeRunning();

    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      `${CONTAINER_RUNTIME_BIN} system start`,
      { stdio: 'pipe', timeout: 30000 },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      3,
      'container network inspect default',
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
    );
    expect(logger.info).toHaveBeenCalledWith('Container runtime started');
  });

  it('throws with a helpful message when network inspect fails', () => {
    mockExecSync.mockReturnValueOnce(''); // system status ok
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('vmnet plugin not loaded');
    }); // network inspect fails

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      /Failed to inspect Apple Container default network.*vmnet plugin not loaded/,
    );
  });

  it('throws when network inspect returns no ipv4Gateway/ipv4Subnet', () => {
    mockExecSync.mockReturnValueOnce(''); // system status ok
    mockExecSync.mockReturnValueOnce(JSON.stringify([{ status: {} }])); // empty status

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      /did not report ipv4Gateway and ipv4Subnet/,
    );
  });

  it('throws when both status and start fail', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('failed');
    });

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      'Container runtime is required but failed to start',
    );
    expect(logger.error).toHaveBeenCalled();
  });
});

// --- cleanupOrphans ---

describe('cleanupOrphans', () => {
  it('stops orphaned nanoclaw containers from JSON output', () => {
    // Apple Container ls returns JSON
    const lsOutput = JSON.stringify([
      { status: 'running', configuration: { id: 'nanoclaw-group1-111' } },
      { status: 'stopped', configuration: { id: 'nanoclaw-group2-222' } },
      { status: 'running', configuration: { id: 'nanoclaw-group3-333' } },
      { status: 'running', configuration: { id: 'other-container' } },
    ]);
    mockExecSync.mockReturnValueOnce(lsOutput);
    // stop calls succeed
    mockExecSync.mockReturnValue('');

    cleanupOrphans();

    // ls + 2 stop calls (only running nanoclaw- containers)
    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-group1-111`,
      { stdio: 'pipe' },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      3,
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-group3-333`,
      { stdio: 'pipe' },
    );
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2, names: ['nanoclaw-group1-111', 'nanoclaw-group3-333'] },
      'Stopped orphaned containers',
    );
  });

  it('does nothing when no orphans exist', () => {
    mockExecSync.mockReturnValueOnce('[]');

    cleanupOrphans();

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('warns and continues when ls fails', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('container not available');
    });

    cleanupOrphans(); // should not throw

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to clean up orphaned containers',
    );
  });

  it('continues stopping remaining containers when one stop fails', () => {
    const lsOutput = JSON.stringify([
      { status: 'running', configuration: { id: 'nanoclaw-a-1' } },
      { status: 'running', configuration: { id: 'nanoclaw-b-2' } },
    ]);
    mockExecSync.mockReturnValueOnce(lsOutput);
    // First stop fails
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('already stopped');
    });
    // Second stop succeeds
    mockExecSync.mockReturnValueOnce('');

    cleanupOrphans(); // should not throw

    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2, names: ['nanoclaw-a-1', 'nanoclaw-b-2'] },
      'Stopped orphaned containers',
    );
  });
});
