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
    timeoutMs,
    retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    // Set up per-attempt timeout controller
    const attemptController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        attemptController.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
      }, timeoutMs);
    }

    const abortHandler = () => attemptController.abort(signal?.reason);
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      const response = await fetch(url, {
        ...init,
        signal: attemptController.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      const isStatusRetryable = retryOnStatus.includes(response.status);
      const customRetry = shouldRetry ? shouldRetry(response, attempt) : isStatusRetryable;

      if (customRetry && attempt < retries) {
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
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortHandler);

      // Do not retry intentional outer aborts
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }

      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      const isNetworkDrop = isTransientNetworkError(error);
      const customRetry = shouldRetry ? shouldRetry(error, attempt) : (isNetworkDrop || isTimeout);

      if (customRetry && attempt < retries) {
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