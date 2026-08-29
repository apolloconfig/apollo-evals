import { describe, expect, it } from 'vitest';
import { parseCodexJsonl, usageFromEvents } from '../src/agent/codex-jsonl.js';

describe('Codex JSONL normalization', () => {
  it('extracts commands, searches, usage and parse errors', () => {
    const source = [
      JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'apollo config set x y' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'web_search', url: 'https://www.apolloconfig.com/' } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 123, output_tokens: 45 } }),
      'not-json',
    ].join('\n');
    const parsed = parseCodexJsonl(source);
    expect(parsed.events.map((event) => event.type)).toEqual(['command', 'web_search', 'usage']);
    expect(usageFromEvents(parsed.events)).toEqual({ inputTokens: 123, outputTokens: 45 });
    expect(parsed.parseErrors).toBe(1);
  });
});
