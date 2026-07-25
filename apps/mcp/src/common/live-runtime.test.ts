import { describe, expect, it } from 'vitest';

import { defaultLiveToolRuntime } from './live-runtime.js';

describe('defaultLiveToolRuntime', () => {
  it('executes Windows command wrappers through the MCP command runner', async () => {
    const result = await defaultLiveToolRuntime.runCommand('scripts/science/plip.cmd', ['-h']);

    expect(result.stdout).toContain('usage: plip.cmd');
  });
});
