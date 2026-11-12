import {
  computeJitterDelay,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  parseRateLimitDelay,
  sleep,
} from './engine.js';
import { HeaderSource, RetryOptions } from './types.js';

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  headers?: HeaderSource;
  response?: {
    status?: number;
    headers?: HeaderSource;
  };
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
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

    try {
      return await fn(attempt);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      const err = error as ErrorWithStatus;
      const statusCode = err?.status ?? err?.statusCode ?? err?.response?.status;
      const headers = err?.headers ?? err?.response?.headers;

      const isStatusRetryable = statusCode !== undefined && retryOnStatus.includes(statusCode);
      const isNetworkRetryable = isTransientNetworkError(error);
      const customRetry = shouldRetry
        ? shouldRetry(error, attempt)
        : (isStatusRetryable || isNetworkRetryable);

      if (!customRetry) {
        throw error;
      }

      let chosenDelay: number;
      const headerDelay = headers ? parseRateLimitDelay(headers) : null;

      if (headerDelay !== null) {
        chosenDelay = Math.min(maxDelayMs, headerDelay);
      } else {
        chosenDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
      }

      onRetry?.(error, attempt + 1, chosenDelay);
      await sleep(chosenDelay, signal);
      attempt++;
    }
  }
}