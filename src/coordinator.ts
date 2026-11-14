import { findProviderAdapter } from './adapters.js';
import { HeaderSource, RateLimitResult } from './types.js';

/**
 * In-process rate-limit coordinator.
 * Maintains shared cooldown state across concurrent requests to eliminate retry storms.
 */
export class ProviderCoordinator {
  private inFlight: number = 0;
  private readonly maxConcurrency: number;
  private readonly providerName: string;
  private cooldownUntil: number = 0;
  private queue: Array<() => void> = [];

  constructor(concurrency: number = 10, providerName: string = 'generic') {
    this.maxConcurrency = concurrency;
    this.providerName = providerName;
  }

  public getInFlight(): number {
    return this.inFlight;
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

  public async schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquireSlot(signal);
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    // Wait if coordinator is in global cooldown
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

    // Concurrency queue
    if (this.inFlight >= this.maxConcurrency) {
      await new Promise<void>((resolve, reject) => {
        const entry = () => resolve();
        this.queue.push(entry);

        signal?.addEventListener(
          'abort',
          () => {
            this.queue = this.queue.filter((q) => q !== entry);
            reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true }
        );
      });
    }

    this.inFlight++;
  }

  private releaseSlot(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) {
      next();
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
    coordinators.set(provider, new ProviderCoordinator(concurrency, provider));
  }
  return coordinators.get(provider)!;
}