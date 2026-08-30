import type { NormalizedEvent } from '../core/types.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}

function numberValue(...values: unknown[]): number {
  return values.find((value): value is number => typeof value === 'number') ?? 0;
}

function usageEvent(recordType: string, usageValue: unknown): NormalizedEvent | undefined {
  const usage = asRecord(usageValue);
  if (!Object.keys(usage).length) return undefined;
  const inputTokens = numberValue(usage.input_tokens, usage.inputTokens)
    + numberValue(usage.cache_creation_input_tokens)
    + numberValue(usage.cache_read_input_tokens);
  const outputTokens = numberValue(usage.output_tokens, usage.outputTokens);
  return { type: 'usage', rawType: recordType, inputTokens, outputTokens };
}

function normalizeToolUse(content: JsonRecord): NormalizedEvent {
  const name = stringValue(content.name) ?? 'unknown';
  const input = asRecord(content.input);
  const rawType = `tool_use:${name}`;
  if (name === 'Bash') {
    return { type: 'command', rawType, command: stringValue(input.command) };
  }
  if (['Edit', 'MultiEdit', 'NotebookEdit', 'Write'].includes(name)) {
    return {
      type: 'file_change',
      rawType,
      path: stringValue(input.file_path, input.notebook_path, input.path),
    };
  }
  if (name === 'WebFetch') {
    return { type: 'web_search', rawType, url: stringValue(input.url), text: stringValue(input.prompt) };
  }
  if (name === 'WebSearch') {
    return { type: 'web_search', rawType, text: stringValue(input.query) };
  }
  return { type: 'other', rawType };
}

export function normalizeClaudeRecord(record: JsonRecord): NormalizedEvent[] {
  const recordType = stringValue(record.type) ?? 'unknown';
  const message = asRecord(record.message);
  const content = Array.isArray(message.content) ? message.content : [];
  const events: NormalizedEvent[] = [];

  for (const value of content) {
    const block = asRecord(value);
    const blockType = stringValue(block.type) ?? 'unknown';
    if (blockType === 'text') {
      events.push({ type: 'message', rawType: `${recordType}:text`, text: stringValue(block.text) });
    } else if (blockType === 'thinking') {
      events.push({ type: 'reasoning', rawType: `${recordType}:thinking`, text: stringValue(block.thinking, block.text) });
    } else if (blockType === 'tool_use') {
      events.push(normalizeToolUse(block));
    }
  }

  const usage = usageEvent(recordType, record.usage ?? message.usage);
  if (usage) events.push(usage);
  if (!events.length && recordType === 'result' && typeof record.result === 'string') {
    events.push({ type: 'message', rawType: recordType, text: record.result });
  }
  if (!events.length) events.push({ type: 'other', rawType: recordType });
  return events;
}

export function parseClaudeJsonl(source: string): {
  records: JsonRecord[];
  events: NormalizedEvent[];
  parseErrors: number;
} {
  const records: JsonRecord[] = [];
  const events: NormalizedEvent[] = [];
  let parseErrors = 0;
  for (const line of source.split(/\r?\n/).filter(Boolean)) {
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        parseErrors += 1;
        continue;
      }
      const record = value as JsonRecord;
      records.push(record);
      events.push(...normalizeClaudeRecord(record));
    } catch {
      parseErrors += 1;
    }
  }
  return { records, events, parseErrors };
}

export function usageFromClaudeRecords(records: JsonRecord[]): { inputTokens: number; outputTokens: number } {
  const result = [...records].reverse().find((record) => record.type === 'result');
  if (result) {
    const usage = usageEvent('result', result.usage);
    if (usage) return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
  }
  return records.reduce<{ inputTokens: number; outputTokens: number }>((total, record) => {
    if (record.type !== 'assistant') return total;
    const usage = usageEvent('assistant', asRecord(record.message).usage);
    total.inputTokens += usage?.inputTokens ?? 0;
    total.outputTokens += usage?.outputTokens ?? 0;
    return total;
  }, { inputTokens: 0, outputTokens: 0 });
}

export function claudeResultFailed(records: JsonRecord[]): boolean {
  const result = [...records].reverse().find((record) => record.type === 'result');
  if (!result) return true;
  return result?.is_error === true || (typeof result?.subtype === 'string' && result.subtype !== 'success');
}
