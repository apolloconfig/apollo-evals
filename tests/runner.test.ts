import { describe, expect, it } from 'vitest';
import { attemptWorkspacePath } from '../src/core/runner.js';
import type { AttemptIdentity } from '../src/core/types.js';

const BASE_IDENTITY: AttemptIdentity = {
  runId: 'benchmark-isolation',
  profileId: 'codex-medium',
  scenarioId: 'java-typed-read',
  attempt: 1,
  seed: 12345,
};

describe('attempt workspace isolation', () => {
  it('uses a distinct workspace for profiles running the same scenario in parallel', () => {
    const medium = attemptWorkspacePath(BASE_IDENTITY, 'attempt-01');
    const claude = attemptWorkspacePath(
      { ...BASE_IDENTITY, profileId: 'claude-medium' },
      'attempt-01',
    );

    expect(claude).not.toBe(medium);
  });

  it('includes retry label and seed in the workspace identity', () => {
    const original = attemptWorkspacePath(BASE_IDENTITY, 'attempt-01');
    const retry = attemptWorkspacePath(BASE_IDENTITY, 'timeout-retry-01');
    const differentSeed = attemptWorkspacePath(
      { ...BASE_IDENTITY, seed: BASE_IDENTITY.seed + 1 },
      'attempt-01',
    );

    expect(retry).not.toBe(original);
    expect(differentSeed).not.toBe(original);
  });
});
