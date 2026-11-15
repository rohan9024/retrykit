import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRetryClient } from '../src/client.js';

describe('createRetryClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('coordinates retries through unified client', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response('Rate Limited', { status: 429, headers: { 'retry-after': '0.01' } }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));
    globalThis.fetch = mock;

    const client = createRetryClient({
      provider: 'openai',
      concurrency: 5,
      budget: { capacity: 10, refillPerSecond: 1 },
    });

    const res = await client.fetch('https://api.openai.com/v1/chat/completions');
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});