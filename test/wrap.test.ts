import { describe, expect, it, vi } from 'vitest';
import { retry } from '../src/wrap.js';

describe('retry() SDK wrapper', () => {
  it('recognizes Google Gemini RESOURCE_EXHAUSTED errors', async () => {
    const geminiError = new Error('Quota exceeded') as Error & { error: { status: string } };
    geminiError.error = { status: 'RESOURCE_EXHAUSTED' };

    const fn = vi.fn()
      .mockRejectedValueOnce(geminiError)
      .mockResolvedValueOnce({ text: 'Recovered response' });

    const result = await retry(fn, { baseDelayMs: 5 });
    expect(result).toEqual({ text: 'Recovered response' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes AbortSignal into user task', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation((attempt, signal) => {
      expect(signal).toBe(controller.signal);
      return Promise.resolve('ok');
    });

    await retry(fn, { signal: controller.signal });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes onRetry callback before retrying', async () => {
    const onRetry = vi.fn();
    let attempts = 0;
    const fn = vi.fn().mockImplementation((attempt, signal) => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('Rate limit exceeded') as any;
        err.status = 429;
        return Promise.reject(err);
      }
      return Promise.resolve('success');
    });
    const result = await retry(fn, {
      retries: 2,
      minTimeout: 10,
      maxTimeout: 20,
      baseDelayMs: 10,
      maxDelayMs: 20,
      onRetry,
      shouldRetry: () => true,
    } as any);
    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        error: expect.any(Error),
        delayMs: expect.any(Number),
      }),
      1,
      expect.any(Number)
    );
  });
});