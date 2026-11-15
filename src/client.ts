import { findProviderAdapter } from './adapters.js';
import { createRetryBudget, TokenBucketRetryBudget } from './budget.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { getProviderCoordinator, ProviderCoordinator } from './coordinator.js';
import {
  computeJitterDelay,
  DeadlineExceededError,
  DEFAULT_RETRYABLE_STATUS_CODES,
  isTransientNetworkError,
  RateLimitExceededError,
  safelyCancelDiscardedBody,
  sleep,
} from './engine.js';
import { combineAbortSignals } from './fetch.js';
import { retryStream } from './stream.js';
import {
  FetchRetryOptions,
  ProviderAdapter,
  ResumableStreamOptions,
  RetryClientOptions,
} from './types.js';
import { retry } from './wrap.js';

export class RetryClient {
  public readonly coordinator: ProviderCoordinator;
  public readonly circuitBreaker?: CircuitBreaker;
  public readonly budget?: TokenBucketRetryBudget;
  private readonly defaultOptions: FetchRetryOptions;
  private readonly providerAdapter: ProviderAdapter;

  constructor(options: RetryClientOptions = {}) {
    const providerName =
      typeof options.provider === 'string'
        ? options.provider
        : options.provider?.name ?? 'generic';

    this.providerAdapter =
      typeof options.provider === 'object' && options.provider !== null
        ? options.provider
        : findProviderAdapter(providerName);

    const scopeKey = `${providerName}:${options.scope ?? 'default'}`;
    this.coordinator = getProviderCoordinator(scopeKey, options.concurrency ?? 10);

    if (options.circuitBreaker !== false && options.circuitBreaker !== undefined) {
      this.circuitBreaker =
        typeof options.circuitBreaker === 'object'
          ? new CircuitBreaker(options.circuitBreaker)
          : new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 });
    }

    if (options.budget !== false && options.budget !== undefined) {
      this.budget =
        typeof options.budget === 'object'
          ? createRetryBudget(options.budget)
          : createRetryBudget({ capacity: 20, refillPerSecond: 5 });
    }

    this.defaultOptions = options.retry ?? {};
  }

  public async fetch(
    url: string | URL | Request,
    init?: RequestInit,
    callOptions?: FetchRetryOptions
  ): Promise<Response> {
    const merged = { ...this.defaultOptions, ...callOptions };
    const {
      retries = 3,
      baseDelayMs = 500,
      maxDelayMs = 30000,
      timeoutMs,
      maxElapsedTimeMs,
      exceedsMaxDelayBehavior = 'throw',
      retryOnStatus = DEFAULT_RETRYABLE_STATUS_CODES,
      shouldRetry,
      onRetry,
      signal,
    } = merged;

    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      if (maxElapsedTimeMs && Date.now() - startTime >= maxElapsedTimeMs) {
        throw new DeadlineExceededError(Date.now() - startTime, maxElapsedTimeMs);
      }

      // 1. Acquire network slot
      await this.coordinator.acquireSlot(signal);

      const attemptController = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          attemptController.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'TimeoutError'));
        }, timeoutMs);
      }

      const { signal: combinedSignal, cleanup } = combineAbortSignals([
        signal,
        attemptController.signal,
      ]);

      let response: Response;
      try {
        if (this.circuitBreaker) {
          response = await this.circuitBreaker.execute(() => fetch(url, { ...init, signal: combinedSignal }));
        } else {
          response = await fetch(url, { ...init, signal: combinedSignal });
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        this.coordinator.releaseSlot();

        if (signal?.aborted) throw signal.reason ?? err;

        const isTimeout = err instanceof Error && err.name === 'TimeoutError';
        const isNetworkDrop = isTransientNetworkError(err);
        const custom = shouldRetry ? shouldRetry(err, attempt) : isNetworkDrop || isTimeout;

        if (custom && attempt < retries) {
          this.budget?.acquire(1);
          const delay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
          onRetry?.(err, attempt + 1, delay);
          await sleep(delay, signal);
          attempt++;
          continue;
        }

        throw err;
      }

      if (timeoutId) clearTimeout(timeoutId);
      cleanup();
      this.coordinator.releaseSlot();

      const isStatusRetryable = retryOnStatus.includes(response.status);
      const custom = shouldRetry ? shouldRetry(response, attempt) : isStatusRetryable;

      if (custom && attempt < retries) {
        await safelyCancelDiscardedBody(response);
        this.budget?.acquire(1);

        const rateLimitResult = this.coordinator.updateFromHeaders(response.headers, this.providerAdapter.name);
        const headerDelay = rateLimitResult ? rateLimitResult.retryAfterMs : null;

        if (headerDelay !== null && headerDelay > maxDelayMs) {
          if (exceedsMaxDelayBehavior === 'throw') {
            throw new RateLimitExceededError(headerDelay, maxDelayMs);
          }
        }

        const backoffDelay = computeJitterDelay(attempt, baseDelayMs, maxDelayMs);
        const chosenDelay = headerDelay !== null ? Math.min(maxDelayMs, headerDelay) : backoffDelay;

        onRetry?.(response, attempt + 1, chosenDelay);
        await sleep(chosenDelay, signal);
        attempt++;
        continue;
      }

      return response;
    }
  }

  public retry<T>(fn: (attempt: number, signal?: AbortSignal) => Promise<T>, options?: FetchRetryOptions): Promise<T> {
    return retry(fn, { ...this.defaultOptions, ...options });
  }

  public stream<T, C = unknown>(options: ResumableStreamOptions<T, C>): AsyncGenerator<T, void, unknown> {
    return retryStream({ ...this.defaultOptions, ...options });
  }
}

export function createRetryClient(options?: RetryClientOptions): RetryClient {
  return new RetryClient(options);
}