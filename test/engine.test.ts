import { describe, expect, it } from 'vitest';
import {
  calculateRequiredWait,
  computeJitterDelay,
  parseDurationToMs,
  parseTimestampOrDelay,
  RetryBudgetTracker,
} from '../src/engine.js';
import { QuotaBucket } from '../src/types.js';

describe('engine: multi-dimensional quota wait calculation', () => {
  it('takes the maximum reset of all exhausted quota dimensions', () => {
    const buckets: QuotaBucket[] = [
      { dimension: 'tokens', exhausted: true, resetAfterMs: 3000 },
      { dimension: 'requests', exhausted: true, resetAfterMs: 15000 },
      { dimension: 'project_tokens', exhausted: false, resetAfterMs: 60000 },
    ];

    const wait = calculateRequiredWait(buckets);
    expect(wait).toBe(15000); // Must be max of exhausted dimensions only
  });
});

describe('engine: timestamp and epoch parsing', () => {
  const fixedNow = 1700000000000;

  it('parses Anthropic RFC 3339 timestamps', () => {
    const target = new Date(fixedNow + 20000).toISOString();
    expect(parseTimestampOrDelay(target, fixedNow)).toBe(20000);
  });

  it('parses Unix epoch seconds (> 1e9)', () => {
    const epochSec = (fixedNow + 12000) / 1000;
    expect(parseTimestampOrDelay(String(epochSec), fixedNow)).toBe(12000);
  });

  it('parses pure relative seconds without epoch misclassification', () => {
    expect(parseTimestampOrDelay('45', fixedNow)).toBe(45000);
  });
});

describe('engine: retry budget tracker', () => {
  it('caps extra retry attempts within sliding window', () => {
    const tracker = new RetryBudgetTracker({ maxExtraAttempts: 2, windowMs: 1000 });
    const now = 10000;

    expect(tracker.canRetry(now)).toBe(true);
    tracker.recordRetry(now);

    expect(tracker.canRetry(now + 100)).toBe(true);
    tracker.recordRetry(now + 100);

    // Budget exceeded
    expect(tracker.canRetry(now + 200)).toBe(false);

    // After window elapses
    expect(tracker.canRetry(now + 1500)).toBe(true);
  });
});