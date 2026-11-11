import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryFetch } from '../src/fetch.js';

describe('retryFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('resolves on initial 200 OK without retrying', async () => {
    const mock = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    globalThis.fetch = mock;

    const res = await retryFetch('https://api.openai.com/v1/models');
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and honors retry-after header', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Rate Limited', {
          status: 429,
          headers: { 'retry-after': '0.05' },
        })
      )
      .mockResolvedValueOnce(new Response('Success', { status: 200 }));
    globalThis.fetch = mock;

    const onRetry = vi.fn();
    const res = await retryFetch('https://api.openai.com/v1/chat/completions', undefined, {
      retries: 2,
      onRetry,
    });

    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Response), 1, 50);
  });

  it('retries on 500 server error and succeeds', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Internal Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('Success', { status: 200 }));
    globalThis.fetch = mock;

    const res = await retryFetch('https://api.anthropic.com/v1/messages', undefined, {
      baseDelayMs: 10,
    });

    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('stops and rejects when AbortSignal triggers', async () => {
    const controller = new AbortController();
    const mock = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(new Response('Rate Limited', { status: 429 }));
    });
    globalThis.fetch = mock;

    await expect(
      retryFetch('https://example.com', undefined, {
        signal: controller.signal,
        baseDelayMs: 10,
      })
    ).rejects.toThrow();
  });
});