import { RetryOptions, RetryState, FallbackStep, FallbackReport } from './types.js';
import { computeBackoffDelay } from './backoff.js';
import { extractRateLimitInfo } from './providers.js';
import { KeyPool } from './keys.js';
import { BudgetTracker } from './budget.js';
import { compactMessages } from './compaction.js';
import { globalSingleFlight } from './singleflight.js';
import { classifyFailure } from './policy/classify.js';

export class MaxRetriesExceededError extends Error {
  constructor(public readonly attempts: number, public readonly lastError: unknown) {
    super(`Operation failed after ${attempts} attempts. Last error: ${String((lastError as Error)?.message || lastError)}`);
    this.name = 'MaxRetriesExceededError';
  }
}

export class FatalError extends Error {
  constructor(public readonly reason: string, public readonly originalError: unknown) {
    super(`Fatal non-retryable error: ${reason}`);
    this.name = 'FatalError';
  }
}

export async function retry<T>(
  fn: (attempt: number, context: { key?: string; compactedMessages?: unknown[]; signal?: AbortSignal }) => Promise<T>,
  options: RetryOptions<T> = {}
): Promise<T> {
  const runner = async () => {
    const maxRetries = options.maxRetries ?? 3;
    const timeoutMs = options.timeoutMs;
    const keyPool = options.keys && options.keys.length > 0 ? new KeyPool(options.keys) : null;
    const budgetTracker = options.budget ? new BudgetTracker(options.budget) : null;

    let attempt = 0;
    const startTime = Date.now();
    let compactedPayload: unknown[] | undefined = options.compaction?.messages ?? options.compaction?.getMessages?.();

    while (true) {
      attempt++;

      if (options.signal?.aborted) {
        throw new Error('Operation aborted by signal.');
      }

      budgetTracker?.recordAttempt();

      const currentKey = keyPool ? keyPool.getActiveKey() : undefined;
      const attemptController = new AbortController();
      const deadlineMs = options.totalDeadlineMs;
      const elapsed = Date.now() - startTime;
      const remainingDeadline = deadlineMs === undefined ? undefined : deadlineMs - elapsed;
      if (remainingDeadline !== undefined && remainingDeadline <= 0) {
        throw new Error(`Operation exceeded total deadline of ${deadlineMs}ms.`);
      }
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let deadlineId: ReturnType<typeof setTimeout> | undefined;
      const abort = (reason: Error) => {
        if (!attemptController.signal.aborted) attemptController.abort(reason);
      };
      if (options.attemptTimeoutMs && options.attemptTimeoutMs > 0) {
        timeoutId = setTimeout(() => abort(new Error(`Attempt timed out after ${options.attemptTimeoutMs}ms`)), options.attemptTimeoutMs);
      }
      if (remainingDeadline !== undefined) {
        deadlineId = setTimeout(() => abort(new Error(`Operation exceeded total deadline of ${deadlineMs}ms`)), remainingDeadline);
      }
      const linked = new AbortController();
      const forwardAbort = (event: Event) => linked.abort((event.target as AbortSignal).reason);
      const signals = [options.signal, attemptController.signal].filter((s): s is AbortSignal => Boolean(s));
      for (const signal of signals) {
        if (signal.aborted) linked.abort(signal.reason);
        else signal.addEventListener('abort', forwardAbort, { once: true });
      }

      try {
        const effectiveTimeout = options.attemptTimeoutMs ?? timeoutMs;
        if (effectiveTimeout && effectiveTimeout > 0 && !timeoutId) {
          timeoutId = setTimeout(() => abort(new Error(`Attempt timed out after ${effectiveTimeout}ms`)), effectiveTimeout);
        }
        const taskPromise = fn(attempt, { key: currentKey, compactedMessages: compactedPayload, signal: linked.signal });

        const result = await taskPromise;
        if (currentKey && keyPool) keyPool.markHealthy(currentKey);

        options.onSuccess?.(result, attempt, Date.now() - startTime);
        return result;
      } catch (rawError) {
        if (options.signal?.aborted) throw rawError;

        const rateInfo = extractRateLimitInfo(rawError, options.provider);
        const classification = classifyFailure(rawError, { provider: options.provider as any, signalAborted: options.signal?.aborted });

        // Immediate Halt on Fatal Errors
        if (rateInfo.isFatal || ['billing_exhausted', 'auth_error', 'invalid_request'].includes(classification.category)) {
          throw new FatalError(rateInfo.fatalReason || 'Unrecoverable error', rawError);
        }

        // Context Overflow Auto-Compaction
        if (rateInfo.isContextOverflow && options.compaction?.enabled && Array.isArray(compactedPayload)) {
          const originalLen = compactedPayload.length;
          compactedPayload = compactMessages(compactedPayload as never[], options.compaction);
          options.onCompacted?.(originalLen, compactedPayload.length);
        }

        // Key Rotation on 429
        if (rateInfo.isRateLimited && classification.allowKeyRotation && keyPool && currentKey) {
          const newKey = keyPool.markRateLimited(currentKey, rateInfo.retryAfterMs);
          options.onKeyRotate?.(currentKey, newKey, rateInfo.retryAfterMs || 60000);
        }

        // User Custom Predicate
        if (options.shouldRetry) {
          const canRetry = await options.shouldRetry(rawError, attempt);
          if (!canRetry) throw rawError;
        } else if (!classification.retrySameKey && !classification.allowKeyRotation) {
          throw rawError;
        }

        if (attempt > maxRetries) {
          options.onError?.(rawError, attempt);
          throw new MaxRetriesExceededError(attempt, rawError);
        }

        const delayMs = computeBackoffDelay(attempt, options.backoff, rateInfo.retryAfterMs);

        const state: RetryState = {
          attempt,
          maxRetries,
          error: rawError,
          delayMs,
          totalTimeMs: Date.now() - startTime,
          currentKey,
        };

        await options.onRetry?.(state);

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          if (options.signal) {
            options.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new Error('Operation aborted while awaiting backoff.'));
              },
              { once: true }
            );
          }
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (deadlineId) clearTimeout(deadlineId);
        for (const signal of signals) signal.removeEventListener('abort', forwardAbort);
      }
    }
  };

  // Single-Flight Deduplication
  if (options.deduplicate && options.deduplicationKey) {
    return globalSingleFlight.do(options.deduplicationKey, runner);
  }

  return runner();
}

export async function fallbackChain<T>(
  steps: Array<FallbackStep<T>>,
  globalOptions?: RetryOptions<T>
): Promise<FallbackReport<T>> {
  if (steps.length === 0) {
    throw new Error('fallbackChain requires at least one step.');
  }

  const startTime = Date.now();
  const errors: Array<{ stepName: string; error: unknown }> = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      const mergedOptions: RetryOptions<T> = { ...globalOptions, ...step.options };

      let attemptsUsed = 0;
      const result = await retry(async (attempt, ctx) => {
        attemptsUsed = attempt;
        return step.execute();
      }, mergedOptions);

      return {
        result,
        stepName: step.name,
        stepIndex: i,
        attemptsUsed,
        totalDurationMs: Date.now() - startTime,
        errorsEncountered: errors,
      };
    } catch (err) {
      errors.push({ stepName: step.name, error: err });
    }
  }

  throw new Error(`All ${steps.length} fallback steps failed. Errors: ${JSON.stringify(errors)}`);
}

export class RetryKit<T = unknown> {
  private options: RetryOptions<T> = {};

  public static create<T = unknown>(): RetryKit<T> {
    return new RetryKit<T>();
  }

  public maxRetries(count: number): this {
    this.options.maxRetries = count;
    return this;
  }

  public timeout(ms: number): this {
    this.options.timeoutMs = ms;
    return this;
  }

  public keys(keyList: string[]): this {
    this.options.keys = keyList;
    return this;
  }

  public budget(budgetOpts: RetryOptions<T>['budget']): this {
    this.options.budget = budgetOpts;
    return this;
  }

  public compaction(compactionOpts: RetryOptions<T>['compaction']): this {
    this.options.compaction = compactionOpts;
    return this;
  }

  public exponentialBackoff(initialMs = 500, maxMs = 30000, factor = 2): this {
    this.options.backoff = { strategy: 'exponential', initialMs, maxMs, factor, jitter: 'full' };
    return this;
  }

  public onRetry(handler: (state: RetryState) => void | Promise<void>): this {
    this.options.onRetry = handler;
    return this;
  }

  public execute(fn: (attempt: number, ctx: { key?: string }) => Promise<T>): Promise<T> {
    return retry(fn, this.options);
  }
}
