import { findProviderAdapter } from './adapters.js';
import { CoordinatorOptions, HeaderSource, RateLimitResult } from './types.js';

export class QueueTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out waiting for coordinator slot after ${timeoutMs}ms.`);
    this.name = 'QueueTimeoutError';
  }
}

export class QueueCapacityExceededError extends Error {
  constructor(maxSize: number) {
    super(`Coordinator queue capacity exceeded (${maxSize}). Request rejected.`);
    this.name = 'QueueCapacityExceededError';
  }
}

/**
 * In-process rate-limit coordinator.
 * Rechecks provider cooldown when waking from queue to eliminate post-admission retry storms.
 */
export class ProviderCoordinator {
  private inFlight: number = 0;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly maxQueueWaitMs: number;
  private readonly providerName: string;
  private cooldownUntil: number = 0;
  private queue: Array<() => void> = [];

  constructor(options: CoordinatorOptions = {}) {
    this.maxConcurrency = options.maxConcurrentAttempts ?? 10;
    this.maxQueueSize = options.maxQueueSize ?? 500;
    this.maxQueueWaitMs = options.maxQueueWaitMs ?? 30000;
    this.providerName = options.provider ?? 'generic';
  }

  public getInFlight(): number {
    return this.inFlight;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getCooldownRemaining(now: number = Date.now()): number {
    return Math.max(0, this.cooldownUntil - now);
  }

  public updateFromHeaders(headers: HeaderSource, urlOrName?: string): RateLimitResult | null {
    const adapter = findProviderAdapter(urlOrName ?? this.providerName, headers);
    const result = adapter.parseRateLimit(headers);
    if (result && result.retryAfterMs > 0) {
      this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + result.retryAfterMs);
    }
    return result;
  }

  public async acquireSlot(signal?: AbortSignal): Promise<void> {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      // 1. Wait out active cooldown if currently throttled
      const cooldown = this.getCooldownRemaining();
      if (cooldown > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, cooldown);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
            },
            { once: true }
          );
        });
      }

      // 2. Concurrency limit admission
      if (this.inFlight >= this.maxConcurrency) {
        if (this.queue.length >= this.maxQueueSize) {
          throw new QueueCapacityExceededError(this.maxQueueSize);
        }

        await new Promise<void>((resolve, reject) => {
          let queueTimer: ReturnType<typeof setTimeout> | undefined;

          const onAbort = () => {
            if (queueTimer) clearTimeout(queueTimer);
            this.queue = this.queue.filter((q) => q !== entry);
            reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
          };

          const entry = () => {
            if (queueTimer) clearTimeout(queueTimer);
            signal?.removeEventListener('abort', onAbort);
            resolve();
          };

          if (this.maxQueueWaitMs > 0) {
            queueTimer = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort);
              this.queue = this.queue.filter((q) => q !== entry);
              reject(new QueueTimeoutError(this.maxQueueWaitMs));
            }, this.maxQueueWaitMs);
          }

          signal?.addEventListener('abort', onAbort, { once: true });
          this.queue.push(entry);
        });

        // Loop back to verify cooldown again (in case an in-flight peer triggered 429 while queued)
        continue;
      }

      this.inFlight++;
      break;
    }
  }

  public releaseSlot(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  public async schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquireSlot(signal);
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  public reset(): void {
    this.inFlight = 0;
    this.cooldownUntil = 0;
    this.queue = [];
  }
}

const coordinators = new Map<string, ProviderCoordinator>();

export function getProviderCoordinator(provider: string = 'default', concurrency: number = 10): ProviderCoordinator {
  if (!coordinators.has(provider)) {
    coordinators.set(provider, new ProviderCoordinator({ provider, maxConcurrentAttempts: concurrency }));
  }
  return coordinators.get(provider)!;
}