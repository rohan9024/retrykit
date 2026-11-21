import { describe, expect, it } from 'vitest';
import { wrapAI, discoverApiKeys } from '../src/auto.js';
import { retryMiddleware } from '../src/ai-sdk.js';
import { withMcpRetry } from '../src/mcp.js';

describe('hero modules', () => {
  it('proxies nested resources, injects keys, and neutralizes maxRetries', async () => {
    const calls: any[] = [];
    const client = { chat: { completions: { create: async (request: any, options: any) => { calls.push([request, options]); return request; } } } };
    const wrapped: any = wrapAI(client, { env: { OPENAI_API_KEYS: 'key-a,key-b' } });
    await wrapped.chat.completions.create({ prompt: 'one' }, { maxRetries: 2 });
    await wrapped.chat.completions.create({ prompt: 'two' }, { maxRetries: 2 });
    expect(calls[0][1].maxRetries).toBe(0);
    expect(calls[0][1].headers.authorization).toBe('Bearer key-a');
    expect(calls[1][1].headers.authorization).toBe('Bearer key-b');
    expect(discoverApiKeys({ OPENAI_API_KEY_2: 'b', OPENAI_API_KEY_1: 'a' })).toEqual(['a', 'b']);
  });

  it('implements structural AI SDK middleware hooks', async () => {
    const middleware = retryMiddleware();
    expect((await middleware.transformParams({ params: { maxRetries: 2 } })).params.maxRetries).toBe(0);
    expect(await middleware.wrapGenerate({ params: {}, doGenerate: async () => 'generated' })).toBe('generated');
    expect(await middleware.wrapStream({ params: {}, doStream: async () => 'stream' })).toBe('stream');
  });

  it('retries only exact MCP-safe operations and handles isError payloads', async () => {
    let calls = 0;
    const result = await withMcpRetry(async () => (++calls === 1 ? { isError: true } : { isError: false, value: 1 }), { method: 'resources/read', maxRetries: 1 });
    expect(result).toEqual({ isError: false, value: 1 });
    calls = 0;
    await expect(withMcpRetry(async () => (++calls, { isError: true }), { method: 'tools/call', maxRetries: 2 })).resolves.toEqual({ isError: true });
    expect(calls).toBe(1);
  });
});
