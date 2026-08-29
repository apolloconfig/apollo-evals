import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aggregateRun, summaryMarkdown } from '../src/core/aggregate.js';
import { writeJson } from '../src/core/fs.js';
import type { AttemptResult } from '../src/core/types.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

function attempt(scenarioId: string, status: AttemptResult['status'], durationMs: number): AttemptResult {
  return {
    runId: 'r', profileId: 'profile', scenarioId, attempt: 1, seed: 1,
    agent: { adapter: 'codex', cliCommand: 'codex', cliVersion: 'codex-cli 9.9.9', model: 'gpt-test', reasoningEffort: 'medium' },
    status, checks: [], durationMs, inputTokens: durationMs, outputTokens: durationMs / 2, toolCalls: 2, apolloHttpCalls: 3, externalUrls: [], stopReason: 'completed',
  };
}
describe('aggregation', () => {
  it('excludes infra errors from success rate and efficiency', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'apollo-evals-')); dirs.push(dir);
    const values = [attempt('a', 'passed', 100), attempt('a', 'failed', 200), attempt('b', 'passed', 300), attempt('b', 'infra_error', 999)];
    for (const [index, value] of values.entries()) await writeJson(path.join(dir, String(index), 'result.json'), value);
    const summary = await aggregateRun(dir);
    expect(summary.macroSuccessRate).toBe(0.75);
    expect(summary.infraErrors).toBe(1);
    expect(summary.stableScenarios).toBe(1);
    expect((summary.passedEfficiencyMedian as { durationMs: number }).durationMs).toBe(200);
    expect(summary.agentRuntimes).toEqual([{ adapter: 'codex', cliCommand: 'codex', cliVersion: 'codex-cli 9.9.9', model: 'gpt-test', reasoningEffort: 'medium' }]);
    expect(summaryMarkdown(summary, 'r')).toContain('| codex | codex | codex-cli 9.9.9 | gpt-test | medium |');
    expect(summaryMarkdown(summary, 'r')).toContain('| Agent profile / scenario |');
  });
});
