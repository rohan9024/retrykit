import { describe, expect, it } from 'vitest';
import {
  computeJitterDelay,
  getHeader,
  isTransientNetworkError,
  parseDurationToMs,
  parseRateLimitDelay,
} from '../src/engine.js';

describe('engine: computeJitterDelay', () => {
  it('should return delays within exponential boundaries', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = computeJitterDelay(attempt, 100, 5000);
      const maxPossible = Math.min(5000, 100 * Math.pow(2, attempt));
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maxPossible);
    }
  });
});

describe('engine: parseRateLimitDelay multi-provider', () => {
  it('parses anthropic-ratelimit-tokens-reset header', () => {
    const delay = parseRateLimitDelay({ 'anthropic-ratelimit-tokens-reset': '15s' });
    expect(delay).toBe(15000);
  });

  it('parses retry-after-ms header (Groq)', () => {
    const delay = parseRateLimitDelay({ 'retry-after-ms': '450' });
    expect(delay).toBe(450);
  });
});

describe('engine: isTransientNetworkError', () => {
  it('detects undici socket drops', () => {
    const err = new Error('undici socket drop') as Error & { code: string };
    err.code = 'UND_ERR_SOCKET';
    expect(isTransientNetworkError(err)).toBe(true);
  });
});