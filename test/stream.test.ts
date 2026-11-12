import { describe, expect, it, vi } from 'vitest';
import { retryStream } from '../src/stream.js';

describe('retryStream', () => {
  it('yields chunks from successful stream generator', async () => {
    async function* makeStream() {
      yield 'chunk-1';
      yield 'chunk-2';
    }

    const chunks: string[] = [];
    for await (const chunk of retryStream(async () => makeStream())) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['chunk-1', 'chunk-2']);
  });

  it('retries on mid-stream failure and succeeds', async () => {
    let callCount = 0;
    async function* flakyStream() {
      callCount++;
      if (callCount === 1) {
        throw new Error('Stream socket disconnected');
      }
      yield 'recovered-chunk';
    }

    const onRetry = vi.fn();
    const chunks: string[] = [];

    for await (const chunk of retryStream(async () => flakyStream(), { baseDelayMs: 5, onRetry })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['recovered-chunk']);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});