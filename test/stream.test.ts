import { describe, expect, it, vi } from 'vitest';
import { retryStream, StreamDuplicatePreventionError } from '../src/stream.js';

describe('retryStream Checkpoint Resumption', () => {
  it('resumes from checkpoint cursor without duplicating chunks on mid-stream drop', async () => {
    let callCount = 0;

    const createStream = async (checkpoint: number | undefined) => {
      callCount++;
      const start = checkpoint ?? 0;

      async function* gen() {
        for (let i = start + 1; i <= 4; i++) {
          if (callCount === 1 && i === 3) {
            throw new Error('Socket drop mid-stream');
          }
          yield { id: i, text: `token-${i}` };
        }
      }
      return gen();
    };

    const chunks: string[] = [];
    const stream = retryStream({
      createStream,
      getCheckpoint: (chunk) => chunk.id,
      baseDelayMs: 5,
    });

    for await (const chunk of stream) {
      chunks.push(chunk.text);
    }

    // Must yield tokens 1 through 4 exactly once with zero duplicates
    expect(chunks).toEqual(['token-1', 'token-2', 'token-3', 'token-4']);
    expect(callCount).toBe(2);
  });

  it('fast-fails with StreamDuplicatePreventionError if uncheckpointed stream drops mid-sentence', async () => {
    let callCount = 0;
    const stream = retryStream({
      createStream: async () => {
        callCount++;
        async function* gen() {
          yield 'Hello';
          throw new Error('Drop after first token');
        }
        return gen();
      },
      baseDelayMs: 5,
    });

    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toBe('Hello');

    await expect(iterator.next()).rejects.toThrow(StreamDuplicatePreventionError);
  });
});