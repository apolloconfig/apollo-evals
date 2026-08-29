import type { NormalizedEvent } from '../core/types.js';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function stringValue(...values: unknown[]): string | undefined { return values.find((value): value is string => typeof value === 'string'); }
function numberValue(...values: unknown[]): number | undefined { return values.find((value): value is number => typeof value === 'number'); }

export function normalizeCodexRecord(record: JsonRecord): NormalizedEvent {
  const type = stringValue(record.type, record.event) ?? 'unknown';
  const item = asRecord(record.item);
  const payload = asRecord(record.payload);
  const itemType = stringValue(item.type, payload.type);
  const command = stringValue(item.command, payload.command, record.command);
  const url = stringValue(item.url, payload.url, record.url);
  const text = stringValue(item.text, item.content, payload.text, record.message, record.text);
  const usage = asRecord(record.usage ?? payload.usage);
  const inputTokens = numberValue(usage.input_tokens, usage.inputTokens, record.input_tokens);
  const outputTokens = numberValue(usage.output_tokens, usage.outputTokens, record.output_tokens);
  if (inputTokens !== undefined || outputTokens !== undefined) return { type: 'usage', rawType: type, inputTokens, outputTokens };
  if (command || /command|exec/i.test(itemType ?? type)) return { type: 'command', rawType: type, command: command ?? text };
  if (url || /web_search|search/i.test(itemType ?? type)) return { type: 'web_search', rawType: type, url, text };
  if (/reason/i.test(itemType ?? type)) return { type: 'reasoning', rawType: type, text };
  if (/file|patch/i.test(itemType ?? type)) return { type: 'file_change', rawType: type, text, path: stringValue(item.path, payload.path) };
  if (text) return { type: 'message', rawType: type, text };
  return { type: 'other', rawType: type };
}

export function parseCodexJsonl(source: string): { records: JsonRecord[]; events: NormalizedEvent[]; parseErrors: number } {
  const records: JsonRecord[] = [];
  const events: NormalizedEvent[] = [];
  let parseErrors = 0;
  for (const line of source.split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line) as JsonRecord;
      records.push(record);
      events.push(normalizeCodexRecord(record));
    } catch { parseErrors += 1; }
  }
  return { records, events, parseErrors };
}

export function usageFromEvents(events: NormalizedEvent[]): { inputTokens: number; outputTokens: number } {
  return events.filter((event) => event.type === 'usage').reduce((sum, event) => ({
    inputTokens: Math.max(sum.inputTokens, event.inputTokens ?? 0),
    outputTokens: Math.max(sum.outputTokens, event.outputTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0 });
}
