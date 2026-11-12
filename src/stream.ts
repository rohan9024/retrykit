import { computeJitterDelay, sleep } from './engine.js';
import { ResumableStreamOptions } from './types.js';

export class StreamDuplicatePreventionError extends Error {
  constructor() {
    super(
      'Stream failed mid-transmission without a checkpoint cursor. Aborted to prevent yielding duplicate tokens. Supply getCheckpoint or allowRestartWithoutCheckpoint: true.'
    );
    this.name = 'StreamDuplicatePreventionError';
  }
}

/**
 * Resilient streaming with checkpoint resumption.
 * If a stream drops mid-sentence:
 * - If getCheckpoint is provided, it resumes seamlessly from that cursor.
 * - If uncheckpointed and chunks were already emitted, it fast-fails to prevent duplicate tokens.
 */
export async function* retryStream<T, C = unknown>(
  options: ResumableStreamOptions<T, C>
): AsyncGenerator<T, void, unknown> {
  const {
    createStream,
    getCheckpoint,
    initialCheckpoint,
    allowRestartWithoutCheckpoint = false,
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    onRetry,
    signal,
  } = options;

  let attempt = 0;
  let currentCheckpoint: C | undefined = initialCheckpoint;
  let yieldedInCurrentSession = false;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      const stream = await createStream(currentCheckpoint, attempt, signal);
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
        }

        yield chunk;
        yieldedInCurrentSession = true;

        if (getCheckpoint) {
          currentCheckpoint = getCheckpoint(chunk, currentCheckpoint);
        }
      }
      return;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      // Prevent duplicate generation if no checkpoint handler is configured
      if (yieldedInCurrentSession && !getCheckpoint && !allowRestartWithoutCheckpoint) {
        throw new StreamDuplicatePreventionError();
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