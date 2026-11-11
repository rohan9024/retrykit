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

  it('respects maxDelayMs ceiling', () => {
    const delay = computeJitterDelay(10, 500, 1000);
    expect(delay).toBeLessThanOrEqual(1000);
  });
});

describe('engine: getHeader', () => {
  it('reads case-insensitively from plain objects', () => {
    expect(getHeader({ 'Retry-After': '5' }, 'retry-after')).toBe('5');
    expect(getHeader({ 'x-ratelimit-reset-requests': '10s' }, 'X-RateLimit-Reset-Requests')).toBe('10s');
  });

  it('reads from Web API Headers', () => {
    const headers = new Headers();
    headers.set('retry-after', '25');
    expect(getHeader(headers, 'Retry-After')).toBe('25');
  });
});

describe('engine: parseDurationToMs', () => {
  it('parses seconds number strings', () => {
    expect(parseDurationToMs('10')).toBe(10000);
    expect(parseDurationToMs('1.5')).toBe(1500);
  });

  it('parses duration strings with units', () => {
    expect(parseDurationToMs('600ms')).toBe(600);
    expect(parseDurationToMs('10s')).toBe(10000);
    expect(parseDurationToMs('2m')).toBe(120000);
    expect(parseDurationToMs('1h')).toBe(3600000);
    expect(parseDurationToMs('1m30s')).toBe(90000);
  });

  it('returns null for invalid strings', () => {
    expect(parseDurationToMs('foobar')).toBeNull();
    expect(parseDurationToMs('')).toBeNull();
  });
});

describe('engine: parseRateLimitDelay', () => {
  it('parses integer retry-after headers', () => {
    const delay = parseRateLimitDelay({ 'retry-after': '3' });
    expect(delay).toBe(3000);
  });

  it('parses HTTP Date retry-after headers', () => {
    const target = new Date(Date.now() + 5000).toUTCString();
    const delay = parseRateLimitDelay({ 'retry-after': target });
    expect(delay).toBeGreaterThan(3000);
    expect(delay).toBeLessThanOrEqual(6000);
  });

  it('parses openai x-ratelimit-reset-requests', () => {
    const delay = parseRateLimitDelay({ 'x-ratelimit-reset-requests': '500ms' });
    expect(delay).toBe(500);
  });

  it('parses anthropic x-ratelimit-reset-tokens', () => {
    const delay = parseRateLimitDelay({ 'x-ratelimit-reset-tokens': '2s' });
    expect(delay).toBe(2000);
  });
});

describe('engine: isTransientNetworkError', () => {
  it('identifies TypeError fetch failed as transient', () => {
    const err = new TypeError('fetch failed');
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it('identifies network codes as transient', () => {
    const err = new Error('Connection failed') as Error & { code: string };
    err.code = 'ECONNRESET';
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it('rejects regular application errors', () => {
    expect(isTransientNetworkError(new Error('Invalid JSON payload'))).toBe(false);
  });
});