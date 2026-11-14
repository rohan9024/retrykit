import { findProviderAdapter } from './adapters.js';
import {
  computeJitterDelay,
  DeadlineExceededError,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  RateLimitExceededError,
  RetryBudgetExceededError,
  RetryBudgetTracker,
  sleep,
} from './engine.js';
import { FetchRetryOptions } from './types.js';

function combineAbortSignals(signals: (AbortSignal | null | undefined)[]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const activeSignals = signals.filter((s): s is AbortSignal => s != null);

  for (const sig of activeSignals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return { signal: controller.signal, cleanup: () => {} };
    }
  }

  const onAbort = (evt: Event) => {
    const target = evt.target as AbortSignal;
    controller.abort(target.reason);
  };

  for (const sig of activeSignals) {
    sig.addEventListener('abort', onAbort, { once: true });
  }

  const cleanup = () => {
    for (const sig of activeSignals) {
      sig.removeEventListener('abort', onAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Replay-safe request factory supporting dynamic body recreation on every retry.
 */
export async function retryRequest(
  requestFactory: (attempt: number, signal: AbortSignal) => Promise<Response>,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    timeoutMs,
    maxElapsedTimeMs,
    retryBudget,
    exceedsMaxDelayBehavior = 'throw',
    retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
    provider,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  const budgetTracker = retryBudget ? new RetryBudgetTracker(retryBudget) : undefined;
  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    if (maxElapsedTimeMs && Date.now() - startTime >= maxElapsedTimeMs) {
      throw new DeadlineExceededError(Date.now() - startTime, maxElapsedTimeMs);
    }

    const attemptController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        attemptController.abort(
          new DOMException(`Response acquisition timed out after ${timeoutMs}ms`, 'TimeoutError')
        );
      }, timeoutMs);
    }

    const { signal: combinedSignal, cleanup } = combineAbortSignals([
      signal,
      attemptController.signal,
    ]);

    try {
      const response = await requestFactory(attempt, combinedSignal);

      if (timeoutId) clearTimeout(timeoutId);
      cleanup();

      const isStatusRetryable = retryOnStatus.includes(response.status);
      const customRetry = shouldRetry ? shouldRetry(response, attempt) : isStatusRetryable;

      if (customRetry && attempt < retries) {
        if (response.body && !response.bodyUsed) {
          try {
            await response.body.cancel();
          } catch {
            /* ignore */
          }
        }

        if (budgetTracker && !budgetTracker.canRetry()) {
          throw new RetryBudgetExceededError();
        }

        const adapter = findProviderAdapter(provider ?? response.url, response.headers);
        const rateLimitResult = adapter.parseRateLimit(response.headers);
        const headerDelay = rateLimitResult ? rateLimitResult.retryAfterMs : null;

        if (headerDelay !== null && headerDelay > maxDelayMs) {
          if (exceedsMaxDelayBehavior === 'throw') {
            throw new RateLimitExceededError(headerDelay, maxDelayMs);
          }
        }

        const backoffDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        const chosenDelay = headerDelay !== null ? Math.min(maxDelayMs, headerDelay) : backoffDelay;

        budgetTracker?.recordRetry();
        onRetry?.(response, attempt + 1, chosenDelay);
        await sleep(chosenDelay, signal);
        attempt++;
        continue;
      }

      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      cleanup();

      if (signal?.aborted) throw signal.reason ?? error;

      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      const isNetworkDrop = isTransientNetworkError(error);
      const customRetry = shouldRetry ? shouldRetry(error, attempt) : isNetworkDrop || isTimeout;

      if (customRetry && attempt < retries) {
        if (budgetTracker && !budgetTracker.canRetry()) {
          throw new RetryBudgetExceededError();
        }

        const chosenDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        budgetTracker?.recordRetry();
        onRetry?.(error, attempt + 1, chosenDelay);
        await sleep(chosenDelay, signal);
        attempt++;
        continue;
      }

      throw error;
    }
  }
}

/**
 * Drop-in replacement for standard native fetch.
 */
export async function retryFetch(
  url: string | URL | Request,
  init?: RequestInit,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const requestMethod = (
    init?.method ?? (url instanceof Request ? url.method : 'GET')
  ).toUpperCase();

  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(requestMethod);
  const targetUrl = url instanceof Request ? url.url : String(url);

  if (options.retrySafety === 'safe-methods-only' && !isSafeMethod) {
    return retryRequest(
      async (_, signal) => {
        return fetch(url, { ...init, signal });
      },
      { ...options, retries: 0 }
    );
  }

  return retryRequest(
    async (_, signal) => {
      return fetch(url, { ...init, signal });
    },
    { ...options, provider: options.provider ?? targetUrl }
  );
}