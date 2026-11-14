import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeadlineExceededError } from '../src/engine.js';
import { retryFetch, retryRequest } from '../src/fetch.js';

describe('retryFetch & retryRequest Safety', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('re-executes requestFactory on retries with fresh bodies', async () => {
    let calls = 0;
    const factory = vi.fn().mockImplementation(async (attempt) => {
      calls++;
      if (attempt === 0) return new Response('Rate limited', { status: 429 });
      return new Response('Success', { status: 200 });
    });

    const res = await retryRequest(factory, { baseDelayMs: 5 });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('enforces maxElapsedTimeMs deadline across retries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Down', { status: 503 }));

    await expect(
      retryFetch('https://example.com', undefined, {
        maxElapsedTimeMs: 30,
        baseDelayMs: 20,
        retries: 5,
      })
    ).rejects.toThrow(DeadlineExceededError);
  });
});