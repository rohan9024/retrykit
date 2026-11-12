import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../src/circuit-breaker.js';

describe('CircuitBreaker Concurrency & Half-Open Protection', () => {
  it('allows only a single probe in HALF_OPEN state and fast-fails concurrent requests', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });

    // 1. Force circuit to OPEN
    await expect(breaker.execute(async () => { throw new Error('Outage'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    // 2. Wait for reset timeout to elapse
    await new Promise((r) => setTimeout(r, 60));
    expect(breaker.getState()).toBe('HALF_OPEN');

    // 3. Initiate hanging probe in HALF_OPEN
    let resolveProbe!: (val: string) => void;
    const probePromise = breaker.execute(
      () => new Promise<string>((resolve) => { resolveProbe = resolve; })
    );

    // 4. Concurrent requests must be rejected immediately
    await expect(breaker.execute(async () => 'fast-fail')).rejects.toThrow(CircuitBreakerOpenError);

    // 5. Complete probe and verify transition to CLOSED
    resolveProbe('probe-ok');
    expect(await probePromise).toBe('probe-ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('does not count user cancellation as an infrastructure failure', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const abortErr = new DOMException('Cancelled', 'AbortError');

    await expect(breaker.execute(async () => { throw abortErr; })).rejects.toThrow('Cancelled');
    expect(breaker.getState()).toBe('CLOSED');
  });
});