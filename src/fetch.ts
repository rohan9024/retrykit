import {
  computeJitterDelay,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  parseRateLimitDelay,
  RateLimitExceededError,
  sleep,
} from './engine.js';
import { RetryOptions } from './types.js';

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
    exceedsMaxDelayBehavior = 'throw',
    retrySafety = 'all',
    retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  // Method safety check
  const requestMethod = (
    init?.method ?? (url instanceof Request ? url.method : 'GET')
  ).toUpperCase();

  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(requestMethod);
  if (retrySafety === 'safe-methods-only' && !isSafeMethod) {
    // Non-idempotent request; execute once without retrying
    return fetch(url, init);
  }

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
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
      url instanceof Request ? url.signal : undefined,
      init?.signal,
      signal,
      attemptController.signal,
    ]);

    try {
      const response = await fetch(url, {
        ...init,
        signal: combinedSignal,
      });

      if (timeoutId) clearTimeout(timeoutId);
      cleanup();

      const isStatusRetryable = retryOnStatus.includes(response.status);
      const customRetry = shouldRetry ? shouldRetry(response, attempt) : isStatusRetryable;

      if (customRetry && attempt < retries) {
        // Free response body socket to prevent resource exhaustion
        if (response.body && !response.bodyUsed) {
          try {
            await response.body.cancel();
          } catch {
            /* ignore */
          }
        }

        const headerDelay = parseRateLimitDelay(response.headers);
        if (headerDelay !== null && headerDelay > maxDelayMs) {
          if (exceedsMaxDelayBehavior === 'throw') {
            throw new RateLimitExceededError(headerDelay, maxDelayMs);
          }
        }

        const backoffDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        const chosenDelay = headerDelay !== null
          ? Math.min(maxDelayMs, headerDelay)
          : backoffDelay;

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