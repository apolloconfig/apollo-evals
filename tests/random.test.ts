import { describe, expect, it } from 'vitest';
import { deriveSeed, SeededRandom } from '../src/core/random.js';

describe('seed replay', () => {
  it('reproduces scenario variables exactly', () => {
    const seed = deriveSeed(42, 'profile', 'scenario', 1);
    const first = new SeededRandom(seed); const second = new SeededRandom(seed);
    expect([first.token('app'), first.int(1, 100), first.token('value')]).toEqual([second.token('app'), second.int(1, 100), second.token('value')]);
  });
});
