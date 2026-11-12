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
});