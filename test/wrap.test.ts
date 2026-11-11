import { describe, expect, it, vi } from 'vitest';
import { retry } from '../src/wrap.js';

describe('retry() generic wrapper', () => {
  it('returns value without retrying on immediate success', async () => {
    const fn = vi.fn().mockResolvedValue('completed');
    const result = await retry(fn);

    expect(result).toBe('completed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries simulated OpenAI SDK 429 error and passes', async () => {
    const rateLimitError = new Error('Rate limit reached') as Error & {
      status: number;
      headers: Record<string, string>;
    };
    rateLimitError.status = 429;
    rateLimitError.headers = { 'x-ratelimit-reset-requests': '20ms' };

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ text: 'Hello AI' });

    const onRetry = vi.fn();
    const res = await retry(fn, { onRetry, baseDelayMs: 5 });

    expect(res).toEqual({ text: 'Hello AI' });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(rateLimitError, 1, 20);
  });

  it('does not retry 400 Bad Request error', async () => {
    const clientError = new Error('Invalid parameter') as Error & { status: number };
    clientError.status = 400;

    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(retry(fn, { retries: 3 })).rejects.toThrow('Invalid parameter');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});