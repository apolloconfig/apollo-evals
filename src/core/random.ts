import { createHash } from 'node:crypto';

export class SeededRandom {
  private state: number;
  constructor(public readonly seed: number) { this.state = seed >>> 0 || 0x9e3779b9; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }
  token(prefix: string, length = 10): string {
    const digest = createHash('sha256').update(`${this.seed}:${prefix}:${this.next()}`).digest('hex');
    return `${prefix}-${digest.slice(0, length)}`;
  }
  int(min: number, max: number): number { return Math.floor(this.next() * (max - min + 1)) + min; }
}

export function deriveSeed(rootSeed: number, ...parts: Array<string | number>): number {
  const digest = createHash('sha256').update([rootSeed, ...parts].join(':')).digest();
  return digest.readUInt32BE(0);
}
