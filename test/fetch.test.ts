import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitExceededError } from '../src/engine.js';
import { retryFetch } from '../src/fetch.js';

describe('retryFetch Safe Execution', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('refuses to retry POST requests when retrySafety is safe-methods-only', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('Error', { status: 500 }));
    globalThis.fetch = mock;

    const res = await retryFetch('https://api.openai.com/v1/chat', { method: 'POST' }, {
      retrySafety: 'safe-methods-only',
      retries: 3,
    });

    expect(res.status).toBe(500);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('throws RateLimitExceededError when server wait exceeds maxDelayMs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Cooldown', { status: 429, headers: { 'retry-after': '60' } })
    );

    await expect(
      retryFetch('https://api.openai.com/v1', undefined, { maxDelayMs: 30000 })
    ).rejects.toThrow(RateLimitExceededError);
  });
});