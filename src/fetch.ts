import {
  computeJitterDelay,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  parseRateLimitDelay,
  sleep,
} from './engine.js';
import { RetryOptions } from './types.js';

export async function retryFetch(
  url: string | URL | Request,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
    onRetry,
    signal,
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: signal ?? init?.signal,
      });

      if (retryOnStatus.includes(response.status) && attempt < retries) {
        const headerDelay = parseRateLimitDelay(response.headers);
        const backoffDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        const chosenDelay = Math.min(maxDelayMs, headerDelay ?? backoffDelay);

        onRetry?.(response, attempt + 1, chosenDelay);
        await sleep(chosenDelay, signal);
        attempt++;
        continue;
      }

      return response;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      if (isTransientNetworkError(error) && attempt < retries) {
        const chosenDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        onRetry?.(error, attempt + 1, chosenDelay);
        await sleep(chosenDelay, signal);
        attempt++;
        continue;
      }

      throw error;
    }
  }
}