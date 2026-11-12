import { computeJitterDelay, sleep } from './engine.js';
import { RetryOptions } from './types.js';

/**
 * Resilient wrapper for Server-Sent Events / LLM chunk streams.
 * If the streaming connection drops mid-generation, it retries and resumes.
 */
export async function* retryStream<T>(
  streamFactory: (attempt: number) => Promise<AsyncIterable<T>>,
  options: RetryOptions = {}
): AsyncGenerator<T, void, unknown> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    onRetry,
    signal,
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      const stream = await streamFactory(attempt);
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
        }
        yield chunk;
      }
      return;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      const delay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay, signal);
      attempt++;
    }
  }
}