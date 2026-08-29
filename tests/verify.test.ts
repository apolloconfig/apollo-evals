import { describe, expect, it } from 'vitest';
import { verifyAgentAdapter } from '../src/core/verify.js';
import type { ProcessResult } from '../src/core/process.js';
import type { AgentProfile } from '../src/core/types.js';

const profile: AgentProfile = {
  id: 'codex-test',
  adapter: 'codex',
  model: 'gpt-test',
  reasoningEffort: 'xhigh',
};

const requiredHelp = [
  '--config', '--strict-config', '--model', '--sandbox', '--cd', '--skip-git-repo-check',
  '--ephemeral', '--ignore-user-config', '--ignore-rules', '--json',
].join(' ');

function result(stdout: string, exitCode = 0): ProcessResult {
  return { exitCode, stdout, stderr: '', timedOut: false, durationMs: 1 };
}

describe('agent adapter verification', () => {
  it('accepts any Codex version when the required capabilities are present', async () => {
    const runtime = await verifyAgentAdapter(profile, async (_command, args) => (
      args[0] === '--version' ? result('codex-cli 99.0.0-next.1\n') : result(requiredHelp)
    ));

    expect(runtime).toEqual({
      adapter: 'codex',
      cliCommand: 'codex',
      cliVersion: 'codex-cli 99.0.0-next.1',
      model: 'gpt-test',
      reasoningEffort: 'xhigh',
    });
  });

  it('rejects an incompatible CLI by capability instead of version number', async () => {
    await expect(verifyAgentAdapter(profile, async (_command, args) => (
      args[0] === '--version' ? result('codex-cli 0.1.0\n') : result(requiredHelp.replace('--ignore-rules', ''))
    ))).rejects.toThrow('does not support the options required by this adapter: --ignore-rules');
  });

  it('reports a missing host CLI as an environment setup problem', async () => {
    await expect(verifyAgentAdapter(profile, async () => {
      throw Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
    })).rejects.toThrow('Codex CLI was not found on PATH');
  });
});
