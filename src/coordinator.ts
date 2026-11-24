import { normalizeHeaders } from './providers.js';

export interface CoordinatorOptions {
  capacity?: number;
  maxConcurrency?: number;
  maxConcurrentAttempts?: number;
  concurrency?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class ProviderCoordinator {
  public capacity: number;
  private inFlight = 0;
  private cooldownUntil = 0;
  private queue: Array<() => void> = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: CoordinatorOptions | number = 10) {
    if (typeof options === 'number') {
      this.capacity = options;
      this.now = Date.now;
      this.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    } else if (typeof options === 'object' && options !== null) {
      this.capacity =
        options.maxConcurrentAttempts ??
        options.capacity ??
        options.maxConcurrency ??
        options.concurrency ??
        10;
      this.now = options.now ?? Date.now;
      this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    } else {
      this.capacity = 10;
      this.now = Date.now;
      this.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  public getInFlight(): number {
    return this.inFlight;
  }

  public setCooldown(arg1: number | string, arg2?: number): void {
    const duration = typeof arg1 === 'number' ? arg1 : (arg2 ?? 60000);
    this.cooldownUntil = this.now() + duration;
  }

  public getCooldownRemaining(): number {
    return Math.max(0, this.cooldownUntil - this.now());
  }

  public isCoolingDown(): boolean {
    return this.getCooldownRemaining() > 0;
  }

  public recordRateLimit(resetMs = 60000): void {
    this.setCooldown(resetMs);
  }

  public recordSuccess(): void {
    // healthy slot
  }

  public updateFromHeaders(
    headers: any,
    _providerName?: string
  ): { retryAfterMs: number; isRateLimited: boolean } | null {
    if (!headers) return null;

    const normalized = normalizeHeaders(headers);
    let retryAfterMs: number | null = null;

    if (normalized['retry-after-ms']) {
      const ms = Number(normalized['retry-after-ms']);
      if (!Number.isNaN(ms)) retryAfterMs = ms;
    } else if (normalized['retry-after']) {
      const sec = Number(normalized['retry-after']);
      if (!Number.isNaN(sec)) {
        retryAfterMs = Math.round(sec * 1000);
      } else {
        const date = Date.parse(normalized['retry-after']);
        if (!Number.isNaN(date)) {
          retryAfterMs = Math.max(0, date - Date.now());
        }
      }
    }

    if (retryAfterMs !== null && retryAfterMs > 0) {
      this.setCooldown(retryAfterMs);
      return { retryAfterMs, isRateLimited: true };
    }

    return null;
  }

  public async acquireSlot(_provider?: string | AbortSignal): Promise<void> {
    // 1. If at capacity, wait in FIFO queue
    if (this.inFlight >= this.capacity) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    // 2. Re-check cooldown when waking up from queue
    while (true) {
      const remaining = this.getCooldownRemaining();
      if (remaining <= 0) {
        break;
      }
      await this.sleep(remaining + 1);
    }

    this.inFlight++;
  }

  public releaseSlot(_provider?: string): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }

  public async execute<T>(
    taskOrProvider: string | (() => Promise<T>),
    maybeTask?: () => Promise<T>
  ): Promise<T> {
    const task = typeof taskOrProvider === 'function' ? taskOrProvider : maybeTask!;
    await this.acquireSlot();
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

export function getProviderCoordinator(
  scopeKey: string,
  capacity = 10
): ProviderCoordinator {
  let coordinator = coordinators.get(scopeKey);
  if (!coordinator) {
    coordinator = new ProviderCoordinator(capacity);
    coordinators.set(scopeKey, coordinator);
  }
  return coordinator;
}
