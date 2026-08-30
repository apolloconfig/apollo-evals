import { writeFile } from 'node:fs/promises';
import { runProcess } from '../core/process.js';
import type { AgentAdapter, AgentRunInput, AgentRunResult } from '../core/types.js';
import { claudeResultFailed, parseClaudeJsonl, usageFromClaudeRecords } from './claude-jsonl.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code' as const;

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const args = [
      '--print', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--safe-mode', '--strict-mcp-config',
      '--dangerously-skip-permissions',
      '--model', input.profile.model,
      '--effort', input.profile.reasoningEffort,
    ];
    const result = await runProcess('claude', args, {
      cwd: input.workspace,
      env: input.env,
      timeoutMs: input.timeoutSec * 1_000,
      stdin: input.prompt,
    });
    const redactedStdout = input.redactor.redact(result.stdout);
    const redactedStderr = input.redactor.redact(result.stderr);
    await writeFile(input.transcriptPath, redactedStdout, { mode: 0o600 });
    await writeFile(input.stderrPath, redactedStderr, { mode: 0o600 });
    const parsed = parseClaudeJsonl(redactedStdout);
    const usage = usageFromClaudeRecords(parsed.records);
    const commands = parsed.events.flatMap((event) => event.type === 'command' && event.command ? [event.command] : []);
    const externalUrls = [...new Set(parsed.events.flatMap((event) => event.type === 'web_search' && event.url ? [event.url] : []))];
    const turnFailed = claudeResultFailed(parsed.records);
    return {
      ok: result.exitCode === 0 && !result.timedOut && !turnFailed,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stopReason: result.timedOut
        ? 'timeout'
        : result.exitCode === 0 && !turnFailed
          ? 'completed'
          : parsed.parseErrors
            ? 'claude_jsonl_parse_error'
            : 'claude_turn_failure',
      durationMs: result.durationMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      toolCalls: parsed.events.filter((event) => event.rawType?.startsWith('tool_use:')).length,
      events: parsed.events,
      commands,
      externalUrls,
    };
  }
}
