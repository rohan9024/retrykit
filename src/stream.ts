import { computeJitterDelay, DeadlineExceededError, sleep } from './engine.js';
import { ResumableStreamOptions } from './types.js';

export class StreamDuplicatePreventionError extends Error {
  constructor() {
    super(
      'Stream interrupted mid-generation without a checkpoint cursor. Aborted to avoid duplicate output. Supply getCheckpoint or allowRestartWithoutCheckpoint: true.'
    );
    this.name = 'StreamDuplicatePreventionError';
  }
}

export class StreamChunkTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Awaiting next stream chunk timed out after ${timeoutMs}ms.`);
    this.name = 'StreamChunkTimeoutError';
  }
}

/**
 * Resilient stream iterator with strict checkpoint cursor acknowledgement.
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
    maxElapsedTimeMs,
    timeoutMs,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  const startTime = Date.now();
  let attempt = 0;
  let currentCheckpoint: C | undefined = initialCheckpoint;
  let yieldedInCurrentSession = false;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    if (maxElapsedTimeMs && Date.now() - startTime >= maxElapsedTimeMs) {
      throw new DeadlineExceededError(Date.now() - startTime, maxElapsedTimeMs);
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

      if (yieldedInCurrentSession && !getCheckpoint && !allowRestartWithoutCheckpoint) {
        throw new StreamDuplicatePreventionError();
      }

      const customRetry = shouldRetry ? shouldRetry(error, attempt) : true;
      if (!customRetry || attempt >= retries) {
        throw error;
      }

      const delay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay, signal);
      attempt++;
    }
  }
}