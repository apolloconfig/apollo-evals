import { writeFile } from 'node:fs/promises';
import { runProcess } from '../core/process.js';
import type { AgentAdapter, AgentRunInput, AgentRunResult } from '../core/types.js';
import { normalizeCodexRecord, parseCodexJsonl, usageFromEvents } from './codex-jsonl.js';

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex' as const;

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const args = [
      'exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--strict-config',
      '--skip-git-repo-check', '--sandbox', 'workspace-write',
      '--config', 'sandbox_workspace_write.network_access=true',
      '--config', `model_reasoning_effort=${JSON.stringify(input.profile.reasoningEffort)}`,
      '--cd', input.workspace, '--model', input.profile.model, '-',
    ];
    const result = await runProcess('codex', args, {
      cwd: input.workspace,
      env: input.env,
      timeoutMs: input.timeoutSec * 1_000,
      stdin: input.prompt,
    });
    const redactedStdout = input.redactor.redact(result.stdout);
    const redactedStderr = input.redactor.redact(result.stderr);
    await writeFile(input.transcriptPath, redactedStdout, { mode: 0o600 });
    await writeFile(input.stderrPath, redactedStderr, { mode: 0o600 });
    const parsed = parseCodexJsonl(redactedStdout);
    const events = parsed.records.map((record) => normalizeCodexRecord(input.redactor.redactValue(record) as Record<string, unknown>));
    const usage = usageFromEvents(events);
    const commands = events.flatMap((event) => event.type === 'command' && event.command ? [event.command] : []);
    const externalUrls = [...new Set(events.flatMap((event) => event.type === 'web_search' && event.url ? [event.url] : []))];
    return {
      ok: result.exitCode === 0 && !result.timedOut,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stopReason: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'completed' : parsed.parseErrors ? 'codex_jsonl_parse_error' : 'codex_turn_failure',
      durationMs: result.durationMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      toolCalls: events.filter((event) => ['command', 'file_change', 'web_search'].includes(event.type)).length,
      events,
      commands,
      externalUrls,
    };
  }
}
