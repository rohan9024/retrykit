import { describe, it, expect, vi } from 'vitest';
import { retry, MaxRetriesExceededError, FatalError, fallbackChain, RetryKit } from '../src/index.js';

describe('retry engine', () => {
  it('resolves on first try if successful', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const res = await retry(fn);
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    let count = 0;
    const fn = vi.fn(async () => {
      count++;
      if (count < 2) throw new Error('Network reset');
      return 'recovered';
    });

    const res = await retry(fn, { maxRetries: 3, backoff: { initialMs: 1 } });
    expect(res).toBe('recovered');
    expect(count).toBe(2);
  });

  it('fails fast on fatal errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid key: unauthorized'));
    await expect(retry(fn, { maxRetries: 3, backoff: { initialMs: 1 } })).rejects.toThrow(FatalError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs fallback chain across different providers', async () => {
    const step1 = vi.fn().mockRejectedValue(new Error('OpenAI 503 Overloaded'));
    const step2 = vi.fn().mockResolvedValue('Claude 3.5 Sonnet Response');

    const report = await fallbackChain([
      { name: 'openai', execute: step1, options: { maxRetries: 1, backoff: { initialMs: 1 } } },
      { name: 'anthropic', execute: step2 },
    ]);

    expect(report.result).toBe('Claude 3.5 Sonnet Response');
    expect(report.stepName).toBe('anthropic');
    expect(report.stepIndex).toBe(1);
  });
});