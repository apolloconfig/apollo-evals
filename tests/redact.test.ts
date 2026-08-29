import { describe, expect, it } from 'vitest';
import { Redactor } from '../src/core/redact.js';

describe('redaction', () => {
  it('removes exact and structured credentials before persistence', () => {
    const redactor = new Redactor(); redactor.add('super-secret-token');
    const output = redactor.redact('Authorization: Bearer super-secret-token\nCookie: SESSION=abc\nAPOLLO_TOKEN=apollo_pat_abcdef');
    expect(output).not.toContain('super-secret-token');
    expect(output).not.toContain('SESSION=abc');
    expect(output).not.toContain('abcdef');
    expect(output).toContain('[REDACTED]');
  });
});
