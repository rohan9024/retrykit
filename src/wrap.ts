import {
  computeJitterDelay,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  parseRateLimitDelay,
  RateLimitExceededError,
  sleep,
} from './engine.js';
import { HeaderSource, RetryOptions } from './types.js';

interface DetailedSDKError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  headers?: HeaderSource;
  response?: {
    status?: number;
    headers?: HeaderSource;
  };
  error?: {
    code?: string;
    status?: string;
  };
}

/**
 * Universal SDK wrapper supporting OpenAI, Anthropic, and Google Gemini error structures.
 */
export async function retry<T>(
  fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    exceedsMaxDelayBehavior = 'throw',
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
      return await fn(attempt, signal);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      const err = error as DetailedSDKError;
      const statusCode = err?.status ?? err?.statusCode ?? err?.response?.status;
      const headers = err?.headers ?? err?.response?.headers;

      // Google Gemini RESOURCE_EXHAUSTED error classification
      const isGeminiQuota =
        err?.error?.status === 'RESOURCE_EXHAUSTED' ||
        err?.code === 'RESOURCE_EXHAUSTED' ||
        err?.message?.includes('RESOURCE_EXHAUSTED');

      const isStatusRetryable =
        (statusCode !== undefined && retryOnStatus.includes(statusCode)) || isGeminiQuota;
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
        if (headerDelay > maxDelayMs && exceedsMaxDelayBehavior === 'throw') {
          throw new RateLimitExceededError(headerDelay, maxDelayMs);
        }
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