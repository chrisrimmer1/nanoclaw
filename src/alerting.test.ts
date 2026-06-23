import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn(
  (_bin: string, _args: string[], cb: (err: Error | null) => void) => {
    cb(null);
  },
);

vi.mock('child_process', () => ({
  execFile: (bin: string, args: string[], cb: (err: Error | null) => void) =>
    execFileMock(bin, args, cb),
}));

import { _resetAlertState, sendAlert } from './alerting.js';

afterEach(() => {
  execFileMock.mockClear();
  _resetAlertState();
});

describe('sendAlert', () => {
  it('invokes notify with the message and a nanoclaw tag', () => {
    sendAlert('k1', 'something broke');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(['--tag', 'nanoclaw', 'something broke']);
  });

  it('suppresses a repeat alert for the same key within the cooldown', () => {
    sendAlert('k1', 'first');
    sendAlert('k1', 'second');
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('still alerts for a different key', () => {
    sendAlert('k1', 'first');
    sendAlert('k2', 'other');
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});
