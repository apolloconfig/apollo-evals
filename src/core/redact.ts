const SECRET_KEY = /(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|cookie)/i;

export class Redactor {
  private readonly secrets = new Set<string>();
  add(secret: string | undefined): void { if (secret && secret.length >= 4) this.secrets.add(secret); }
  redact(text: string): string {
    let output = text;
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) output = output.split(secret).join('[REDACTED]');
    output = output
      .replace(/(Authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s"']+/gi, '$1[REDACTED]')
      .replace(/(Cookie\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
      .replace(/(apollo_pat_)[A-Za-z0-9._-]+/g, '$1[REDACTED]')
      .replace(/((?:OPENAI|CODEX)_[A-Z0-9_]*(?:KEY|TOKEN)\s*=\s*)[^\s]+/g, '$1[REDACTED]');
    return output;
  }
  redactValue(value: unknown): unknown {
    if (typeof value === 'string') return this.redact(value);
    if (Array.isArray(value)) return value.map((entry) => this.redactValue(entry));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : this.redactValue(entry)]));
    }
    return value;
  }
}
