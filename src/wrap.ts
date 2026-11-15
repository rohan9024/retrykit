import { findProviderAdapter, geminiAdapter, openAIAdapter } from './adapters.js';
import {
  computeJitterDelay,
  DeadlineExceededError,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  RateLimitExceededError,
  sleep,
} from './engine.js';
import { CoreRetryOptions, HeaderSource } from './types.js';

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

export interface WrapRetryOptions extends CoreRetryOptions {
  retryOnStatus?: number[];
  exceedsMaxDelayBehavior?: 'throw' | 'defer' | 'clamp';
  provider?: string;
}

export async function retry<T>(
  fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
  options: WrapRetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    maxElapsedTimeMs,
    exceedsMaxDelayBehavior = 'throw',
    retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
    provider = 'generic',
    shouldRetry,
    onRetry,
    signal,
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    if (maxElapsedTimeMs && Date.now() - startTime >= maxElapsedTimeMs) {
      throw new DeadlineExceededError(Date.now() - startTime, maxElapsedTimeMs);
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

      let adapter = findProviderAdapter(provider, headers);
      let classification = adapter.classifyError ? adapter.classifyError(error, statusCode) : null;

      if (!classification || !classification.retryable) {
        for (const candidate of [geminiAdapter, openAIAdapter]) {
          const res = candidate.classifyError?.(error, statusCode);
          if (res && res.retryable) {
            classification = res;
            adapter = candidate;
            break;
          }
        }
      }

      const isStatusRetryable =
        (statusCode !== undefined && retryOnStatus.includes(statusCode)) ||
        (classification !== null && classification.retryable);

      const isNetworkRetryable = isTransientNetworkError(error);
      const customRetry = shouldRetry
        ? shouldRetry(error, attempt)
        : isStatusRetryable || isNetworkRetryable;

      if (!customRetry) {
        throw error;
      }

      let chosenDelay: number;
      const rateLimitResult = headers ? adapter.parseRateLimit(headers) : null;
      const headerDelay = rateLimitResult ? rateLimitResult.retryAfterMs : null;

      if (headerDelay !== null) {
        if (headerDelay > maxDelayMs) {
          if (exceedsMaxDelayBehavior === 'throw') {
            throw new RateLimitExceededError(headerDelay, maxDelayMs);
          }
          if (exceedsMaxDelayBehavior === 'defer') {
            chosenDelay = headerDelay; // Respect the server's requested delay
          } else {
            chosenDelay = maxDelayMs; // Clamp
          }
        } else {
          chosenDelay = headerDelay;
        }
      } else {
        chosenDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
      }

      onRetry?.(error, attempt + 1, chosenDelay);
      await sleep(chosenDelay, signal);
      attempt++;
    }
  }
}