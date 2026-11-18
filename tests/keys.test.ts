import { describe, it, expect } from 'vitest';
import { KeyPool } from '../src/keys.js';

describe('KeyPool', () => {
  it('cycles to next key when rate limited', () => {
    const pool = new KeyPool(['key-A', 'key-B', 'key-C']);
    expect(pool.getActiveKey()).toBe('key-A');

    const next = pool.markRateLimited('key-A', 5000);
    expect(next).toBe('key-B');
    expect(pool.getActiveKey()).toBe('key-B');

    pool.markRateLimited('key-B', 5000);
    expect(pool.getActiveKey()).toBe('key-C');
  });
});