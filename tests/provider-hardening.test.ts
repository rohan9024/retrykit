import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { extractRateLimitInfo } from '../src/providers.js';
import { retryFetch } from '../src/fetch.js';
import { retry } from '../src/retry.js';

let servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); servers = []; });

async function localServer(handler: (count: number, response: import('node:http').ServerResponse) => void): Promise<string> {
  let count = 0;
  const server = createServer((_request, response) => handler(++count, response));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return `http://127.0.0.1:${address.port}/test`;
}

describe('provider rate-limit and billing hardening', () => {
  it('parses OpenAI durations, millisecond retry-after, HTTP dates, Anthropic timestamps, and 529', () => {
    expect(extractRateLimitInfo({ status: 429, headers: { 'x-ratelimit-reset-requests': '464ms' } }).retryAfterMs).toBe(464);
    expect(extractRateLimitInfo({ status: 429, headers: { 'x-ratelimit-reset-requests': '1m30s' } }).retryAfterMs).toBe(90000);
    expect(extractRateLimitInfo({ status: 429, headers: { 'retry-after-ms': '12' } }).retryAfterMs).toBe(12);
    expect(extractRateLimitInfo({ status: 429, headers: { 'retry-after': new Date(Date.now() + 1000).toUTCString() } }).retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(extractRateLimitInfo({ status: 429, headers: { 'anthropic-ratelimit-requests-reset': new Date(Date.now() + 1000).toISOString() } }).isRateLimited).toBe(true);
    expect(extractRateLimitInfo({ status: 529, message: 'overloaded_error' }).isRateLimited).toBe(true);
  });

  it('retries a local 429 response without waiting when retry-after-ms is zero', async () => {
    const url = await localServer((count, response) => {
      response.statusCode = count === 1 ? 429 : 200;
      if (count === 1) response.setHeader('retry-after-ms', '0');
      response.end(count === 1 ? 'retry' : 'ok');
    });
    const response = await retryFetch(url, undefined, { retries: 1, baseDelayMs: 0 });
    expect(await response.text()).toBe('ok');
  });

  it('does not sleep or retry hard billing failures', async () => {
    for (const message of ['insufficient_quota', 'credit_balance_exhausted', 'enforced_spend_limit_reached']) {
      let calls = 0;
      const started = Date.now();
      await expect(retry(async () => { calls++; throw new Error(message); }, { maxRetries: 5, backoff: { initialMs: 1000 } })).rejects.toThrow('Fatal');
      expect(calls).toBe(1);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });
});
