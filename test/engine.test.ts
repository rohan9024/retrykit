import { describe, expect, it } from 'vitest';
import { calculateRequiredWait } from '../src/engine.js';
import { QuotaBucket } from '../src/types.js';

describe('engine: multi-dimensional quota calculations with missing resets', () => {
  it('applies fallback conservative delay when exhausted quota lacks reset header', () => {
    const buckets: QuotaBucket[] = [
      { dimension: 'tokens', exhausted: true, resetAfterMs: 2000 },
      { dimension: 'requests', exhausted: true, resetAfterMs: undefined }, // Missing reset!
    ];

    const { requiredWaitMs, hasUnknownReset } = calculateRequiredWait(buckets, 4000);
    expect(hasUnknownReset).toBe(true);
    expect(requiredWaitMs).toBe(4000); // Must be max(2000, 4000)
  });
});