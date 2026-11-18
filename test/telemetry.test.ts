import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRetryClient } from '../src/client.js';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('Telemetry & Event Hooks', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('triggers onRetry callbacks with structured payloads in RetryClient', async () => {
    const onRetry = vi.fn();
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response('Rate Limited', { status: 429, headers: { 'retry-after': '0.01' } }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));
    globalThis.fetch = mock;

    const client = createRetryClient({
      provider: 'openai',
      retry: {
        onRetry,
      },
    });

    const res = await client.fetch('https://api.openai.com/v1/chat/completions');
    expect(res.status).toBe(200);
    expect(onRetry).toHaveBeenCalledTimes(1);
    const retryArg = onRetry.mock.calls[0][0];
    expect(retryArg).toMatchObject({
      attempt: 1,
      delayMs: expect.any(Number),
      provider: 'openai',
    });
  });

  it('triggers circuit breaker state changes', async () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 50,
      onStateChange,
    });

    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
  });
});