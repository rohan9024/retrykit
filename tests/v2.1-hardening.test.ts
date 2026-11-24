import { describe, expect, it, vi } from 'vitest';
import { classifyFailure, parseRetryAfterMs } from '../src/policy/classify.js';
import { isReplayableBody, isRetrySafeMethod } from '../src/policy/replay-safety.js';
import { UpstashRestStateStore } from '../src/stores/upstash.js';
import { wrapAnthropic, wrapOpenAI } from '../src/auto.js';
import { ProviderCoordinator, QueueFullError } from '../src/coordinator.js';
import { retryStream, StreamDuplicatePreventionError } from '../src/stream.js';
import { compactMessages } from '../src/compaction.js';

describe('v2.1 policy classification', () => {
  it('parses millisecond retry headers', () => expect(parseRetryAfterMs({ 'retry-after-ms': '464' })).toBe(464));
  it('parses numeric retry-after seconds', () => expect(parseRetryAfterMs({ 'retry-after': '1.5' })).toBe(1500));
  it('parses HTTP-date retry-after', () => expect(parseRetryAfterMs({ 'retry-after': new Date(1100).toUTCString() }, 1000)).toBeGreaterThanOrEqual(0));
  it('parses compound provider durations', () => expect(parseRetryAfterMs({ 'x-ratelimit-reset-requests': '1m30s' })).toBe(90000));
  it('classifies billing exhaustion as non-retryable same key', () => expect(classifyFailure({ status: 429, code: 'insufficient_quota' }).retrySameKey).toBe(false));
  it('allows configured key rotation for billing exhaustion', () => expect(classifyFailure({ status: 429, code: 'insufficient_quota' }).allowKeyRotation).toBe(true));
  it('classifies auth as terminal', () => expect(classifyFailure({ status: 401 }).category).toBe('auth_error'));
  it('classifies malformed requests as terminal', () => expect(classifyFailure({ status: 422 }).category).toBe('invalid_request'));
  it('classifies overload as retryable', () => expect(classifyFailure({ status: 529 }).category).toBe('overloaded'));
  it('does not retry unknown failures', () => expect(classifyFailure(new Error('business rule failed')).retrySameKey).toBe(false));
});

describe('v2.1 replay safety', () => {
  it('allows safe methods', () => expect(isRetrySafeMethod('GET')).toBe(true));
  it('requires approval for PUT', () => expect(isRetrySafeMethod('PUT')).toBe(false));
  it('allows idempotent PUT with a key', () => expect(isRetrySafeMethod('PUT', { idempotencyKey: 'x' })).toBe(true));
  it('requires approval for POST', () => expect(isRetrySafeMethod('POST')).toBe(false));
  it('allows explicitly approved POST', () => expect(isRetrySafeMethod('POST', { allowUnsafePostRetry: true })).toBe(true));
  it('rejects disturbed streams as replay bodies', () => expect(isReplayableBody({ getReader() {} })).toBe(false));
});

describe('v2.1 Upstash atomic counters', () => {
  it('uses a pipeline for increment and expiry', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain('/pipeline');
      expect(JSON.parse(String(init.body))).toEqual([['INCRBY', 'budget', 2], ['PEXPIRE', 'budget', 1000]]);
      return new Response(JSON.stringify([{ result: 2 }, { result: 1 }]), { status: 200 });
    });
    const store = new UpstashRestStateStore('https://example.upstash.io', 'token', fetchMock as any);
    await expect(store.increment('budget', 2, 1000)).resolves.toBe(2);
  });
  it('exposes consumeBudget as the atomic increment operation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ result: 7 }]), { status: 200 }));
    const store = new UpstashRestStateStore('https://example.upstash.io', 'token', fetchMock as any);
    await expect(store.consumeBudget('budget', 1)).resolves.toBe(7);
  });
  it('fails clearly on Upstash HTTP errors', async () => {
    const store = new UpstashRestStateStore('https://example.upstash.io', 'token', vi.fn(async () => new Response('', { status: 500 })) as any);
    await expect(store.increment('budget')).rejects.toThrow('Upstash pipeline failed');
  });
});

describe('v2.1 SDK stream and request wrappers', () => {
  it('preserves synchronous Anthropic MessageStream ergonomics', () => {
    const stream = { on: vi.fn(), finalMessage: vi.fn(), async *[Symbol.asyncIterator]() { yield { type: 'message_stop' }; } };
    const client = { messages: { stream: vi.fn(() => stream) } };
    const wrapped: any = wrapAnthropic(client, { keys: ['anthropic-key'] });
    const result = wrapped.messages.stream({ model: 'claude' });
    expect(result).toBe(stream);
    expect(result.then).toBeUndefined();
    expect(client.messages.stream).toHaveBeenCalledTimes(1);
  });
  it('injects Anthropic headers into stream options', () => {
    const client = { messages: { stream: vi.fn((_request: unknown, options: unknown) => options) } };
    const wrapped: any = wrapAnthropic(client, { keys: ['anthropic-key'] });
    const options = wrapped.messages.stream({ model: 'claude' });
    expect(options.maxRetries).toBe(0);
    expect(options.headers['x-api-key']).toBe('anthropic-key');
  });
  it('retries mock OpenAI calls without multiplying SDK retries', async () => {
    const calls: any[] = [];
    const create = vi.fn(async (_request: unknown, options: any) => { calls.push(options); if (calls.length === 1) throw Object.assign(new Error('temporary network reset'), { code: 'ECONNRESET' }); return 'ok'; });
    const wrapped: any = wrapOpenAI({ chat: { completions: { create } } }, { keys: ['openai-key'], maxRetries: 1, backoff: { initialMs: 0 } });
    await expect(wrapped.chat.completions.create({ model: 'gpt' })).resolves.toBe('ok');
    expect(calls).toHaveLength(2);
    expect(calls.every((options) => options.maxRetries === 0)).toBe(true);
  });
});

describe('v2.1 coordinator stress and aborts', () => {
  it('holds no more than four active slots across 200 callers', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrency: 4, maxQueueSize: 250 });
    let active = 0; let maxActive = 0;
    await Promise.all(Array.from({ length: 200 }, async () => { await coordinator.acquireSlot(); active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; coordinator.releaseSlot(); }));
    expect(maxActive).toBeLessThanOrEqual(4);
  });
  it('rejects an overflowing queue', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrency: 1, maxQueueSize: 2 });
    await coordinator.acquireSlot();
    const first = coordinator.acquireSlot().then(() => coordinator.releaseSlot()); const second = coordinator.acquireSlot().then(() => coordinator.releaseSlot());
    await expect(coordinator.acquireSlot()).rejects.toBeInstanceOf(QueueFullError);
    coordinator.releaseSlot(); await Promise.all([first, second]);
  });
  it('removes aborted callers from the FIFO queue', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrency: 1, maxQueueSize: 4 });
    await coordinator.acquireSlot(); const controller = new AbortController();
    const pending = coordinator.acquireSlot(controller.signal); controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(coordinator.getInFlight()).toBe(1); coordinator.releaseSlot();
  });
  it('does not exceed capacity after cooldown expiry', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrency: 4, maxQueueSize: 20 });
    coordinator.recordRateLimit(1);
    let active = 0; let maxActive = 0;
    await Promise.all(Array.from({ length: 20 }, async () => { await coordinator.acquireSlot(); active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; coordinator.releaseSlot(); }));
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const out: T[] = []; for await (const item of source) out.push(item); return out; }
function interruptedStream(failAfter: number, total: number) {
  let attempt = 0;
  return async function* () { attempt++; for (let i = 1; i <= total; i++) { yield { id: i, value: `chunk-${i}` }; if (attempt === 1 && i === failAfter) throw new Error('mid-stream drop'); } };
}

describe('v2.1 stream recovery proofs', () => {
  it.each([1, 10, 5])('rejects unsafe restart at interruption %s', async (failAfter) => {
    await expect(collect(retryStream(interruptedStream(failAfter, 10), { maxRetries: 1, backoff: { initialMs: 0 } }))).rejects.toBeInstanceOf(StreamDuplicatePreventionError);
  });
  it.each([1, 10, 5])('deduplicates recovery at interruption %s with checkpoints', async (failAfter) => {
    const result = await collect(retryStream(interruptedStream(failAfter, 10), { maxRetries: 1, backoff: { initialMs: 0 }, getCheckpoint: (chunk: any) => chunk.id }));
    expect(result.map((chunk: any) => chunk.id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });
});

describe('v2.1 atomic compaction proofs', () => {
  it('keeps three OpenAI tool responses with their assistant call', () => {
    const messages: any[] = [{ role: 'system', content: 'system' }, { role: 'assistant', content: '', tool_calls: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { role: 'tool', tool_call_id: 'a', content: 'A' }, { role: 'tool', tool_call_id: 'b', content: 'B' }, { role: 'tool', tool_call_id: 'c', content: 'C' }, { role: 'user', content: 'latest' }];
    const result = compactMessages(messages, { targetReductionRatio: 0.8, preserveLastNMessages: 1 });
    expect(result.some((m: any) => m.tool_calls)).toBe(result.some((m: any) => m.tool_call_id === 'a'));
  });
  it('keeps Anthropic tool_use and tool_result blocks together', () => {
    const messages: any[] = [{ role: 'system', content: 'system' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'u1' }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'u1' }] }, { role: 'user', content: 'latest' }];
    const result = compactMessages(messages, { targetReductionRatio: 0.9, preserveLastNMessages: 1 });
    expect(result.some((m: any) => m.content?.some?.((b: any) => b.type === 'tool_use'))).toBe(result.some((m: any) => m.content?.some?.((b: any) => b.type === 'tool_result')));
  });
  it('preserves multimodal content arrays', () => {
    const image = { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } }] };
    expect(compactMessages([{ role: 'system', content: 's' }, image, { role: 'user', content: 'latest' }], { preserveLastNMessages: 2 })[1]).toBe(image);
  });
  it('pins configured prefix messages', () => {
    const result = compactMessages([{ role: 'system', content: 's' }, { role: 'developer', content: 'd' }, { role: 'user', content: 'old' }, { role: 'user', content: 'latest' }], { pinPrefixMessages: 2, preserveLastNMessages: 1, targetReductionRatio: 0.9 });
    expect(result.slice(0, 2).map((m) => m.role)).toEqual(['system', 'developer']);
  });
  it('never returns an assistant tool call without a matching tool response when retained', () => {
    const result = compactMessages([{ role: 'assistant', content: '', tool_calls: [{ id: 'x' }] }, { role: 'tool', tool_call_id: 'x', content: 'ok' }, { role: 'user', content: 'latest' }], { preserveLastNMessages: 1, targetReductionRatio: 0.9 });
    const call = result.find((m: any) => m.tool_calls); expect(call ? result.some((m: any) => m.tool_call_id === call.tool_calls[0].id) : true).toBe(true);
  });
});
