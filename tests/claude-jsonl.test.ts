import { describe, expect, it } from 'vitest';
import { claudeResultFailed, parseClaudeJsonl, usageFromClaudeRecords } from '../src/agent/claude-jsonl.js';

describe('Claude Code stream JSON', () => {
  it('normalizes commands, file changes, web access, messages, and total usage', () => {
    const source = [
      { type: 'system', subtype: 'init' },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'Inspect first' },
            { type: 'tool_use', name: 'Bash', input: { command: 'apollo config get key' } },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/workspace/App.java' } },
            { type: 'tool_use', name: 'WebFetch', input: { url: 'https://example.com/docs', prompt: 'Read docs' } },
            { type: 'text', text: 'Done' },
          ],
          usage: { input_tokens: 10, cache_read_input_tokens: 20, output_tokens: 4 },
        },
      },
      {
        type: 'result', subtype: 'success', is_error: false, result: 'Done',
        usage: { input_tokens: 15, cache_creation_input_tokens: 5, cache_read_input_tokens: 30, output_tokens: 7 },
      },
    ].map((record) => JSON.stringify(record)).join('\n');

    const parsed = parseClaudeJsonl(source);
    expect(parsed.parseErrors).toBe(0);
    expect(parsed.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'reasoning', text: 'Inspect first' }),
      expect.objectContaining({ type: 'command', command: 'apollo config get key' }),
      expect.objectContaining({ type: 'file_change', path: '/workspace/App.java' }),
      expect.objectContaining({ type: 'web_search', url: 'https://example.com/docs' }),
      expect.objectContaining({ type: 'message', text: 'Done' }),
    ]));
    expect(usageFromClaudeRecords(parsed.records)).toEqual({ inputTokens: 50, outputTokens: 7 });
    expect(claudeResultFailed(parsed.records)).toBe(false);
  });

  it('detects malformed lines and failed result records', () => {
    const parsed = parseClaudeJsonl('{bad json}\nnull\n{"type":"result","subtype":"error","is_error":true}');
    expect(parsed.parseErrors).toBe(2);
    expect(claudeResultFailed(parsed.records)).toBe(true);
    expect(claudeResultFailed([])).toBe(true);
  });
});
