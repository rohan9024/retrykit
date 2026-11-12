import { describe, expect, it } from 'vitest';
import {
  computeJitterDelay,
  isTransientNetworkError,
  parseDurationToMs,
  parseRateLimitDelay,
  parseTimestampOrDelay,
} from '../src/engine.js';

describe('engine: parseTimestampOrDelay', () => {
  const fixedNow = 1700000000000;

  it('parses Anthropic RFC 3339 timestamps', () => {
    const target = new Date(fixedNow + 15000).toISOString();
    const delay = parseTimestampOrDelay(target, fixedNow);
    expect(delay).toBe(15000);
  });

  it('parses Unix epoch seconds (> 1e9)', () => {
    const epochSec = (fixedNow + 30000) / 1000;
    const delay = parseTimestampOrDelay(String(epochSec), fixedNow);
    expect(delay).toBe(30000);
  });

  it('parses relative seconds without mistaking for epoch', () => {
    expect(parseTimestampOrDelay('60', fixedNow)).toBe(60000);
  });

  it('parses relative duration strings', () => {
    expect(parseDurationToMs('15s')).toBe(15000);
    expect(parseDurationToMs('600ms')).toBe(600);
  });
});

describe('engine: parseRateLimitDelay multi-provider quota dimensions', () => {
  it('prioritizes tokens over requests when tokens quota is 0 (Groq)', () => {
    const headers = {
      'x-ratelimit-remaining-tokens': '0',
      'x-ratelimit-reset-tokens': '12s',
      'x-ratelimit-remaining-requests': '50',
      'x-ratelimit-reset-requests': '1s',
    };
    expect(parseRateLimitDelay(headers)).toBe(12000);
  });

  it('parses Anthropic input tokens reset header', () => {
    const headers = {
      'anthropic-ratelimit-input-tokens-reset': '5s',
    };
    expect(parseRateLimitDelay(headers)).toBe(5000);
  });
});

describe('engine: isTransientNetworkError', () => {
  it('identifies Undici headers and body timeouts', () => {
    const err = new Error('headers timeout') as Error & { code: string };
    err.code = 'UND_ERR_HEADERS_TIMEOUT';
    expect(isTransientNetworkError(err)).toBe(true);
  });
});