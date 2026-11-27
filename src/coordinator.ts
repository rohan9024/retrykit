import { normalizeHeaders } from './providers.js';

export interface CoordinatorOptions {
  capacity?: number;
  maxConcurrency?: number;
  maxConcurrentAttempts?: number;
  concurrency?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxQueueSize?: number;
}

export class QueueFullError extends Error {
  constructor(public readonly maxQueueSize: number) { super(`Provider coordinator queue is full (max ${maxQueueSize}).`); this.name = 'QueueFullError'; }
}

export class ProviderCoordinator {
  public capacity: number;
  private inFlight = 0;
  private cooldownUntil = 0;
  private queue: Array<{ resolve: () => void; reject: (error: unknown) => void; signal?: AbortSignal; onAbort?: () => void }> = [];
  private cooldownWake: Promise<void> | undefined;
  private readonly maxQueueSize: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: CoordinatorOptions | number = 10) {
    if (typeof options === 'number') {
      this.capacity = options;
      this.now = Date.now;
      this.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      this.maxQueueSize = Number.POSITIVE_INFINITY;
    } else if (typeof options === 'object' && options !== null) {
      this.capacity =
        options.maxConcurrentAttempts ??
        options.capacity ??
        options.maxConcurrency ??
        options.concurrency ??
        10;
      this.now = options.now ?? Date.now;
      this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
      this.maxQueueSize = options.maxQueueSize ?? Number.POSITIVE_INFINITY;
    } else {
      this.capacity = 10;
      this.now = Date.now;
      this.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      this.maxQueueSize = Number.POSITIVE_INFINITY;
    }
  }

  public getInFlight(): number {
    return this.inFlight;
  }

  public setCooldown(arg1: number | string, arg2?: number): void {
    const duration = typeof arg1 === 'number' ? arg1 : (arg2 ?? 60000);
    this.cooldownUntil = this.now() + duration;
    this.scheduleCooldownWake();
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

  public async acquireSlot(providerOrSignal?: string | AbortSignal): Promise<void> {
    const signal = providerOrSignal instanceof AbortSignal ? providerOrSignal : undefined;
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    if (this.queue.length === 0 && this.inFlight < this.capacity && !this.isCoolingDown()) {
      this.inFlight++;
      return;
    }
    if (this.queue.length >= this.maxQueueSize) throw new QueueFullError(this.maxQueueSize);
    await new Promise<void>((resolve, reject) => {
      const entry: { resolve: () => void; reject: (error: unknown) => void; signal?: AbortSignal; onAbort?: () => void } = { resolve, reject, signal };
      const onAbort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) this.queue.splice(index, 1);
        reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      };
      entry.onAbort = onAbort;
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(entry);
      this.pumpQueue();
    });
  }

  public releaseSlot(_provider?: string): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.pumpQueue();
  }

  private scheduleCooldownWake(): void {
    if (this.cooldownWake || !this.queue.length) return;
    const remaining = this.getCooldownRemaining();
    if (remaining <= 0) return;
    this.cooldownWake = this.sleep(remaining + 1).finally(() => {
      this.cooldownWake = undefined;
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (this.isCoolingDown()) {
      this.scheduleCooldownWake();
      return;
    }
    while (this.queue.length > 0 && this.inFlight < this.capacity) {
      const next = this.queue.shift()!;
      if (next.signal && next.onAbort) next.signal.removeEventListener('abort', next.onAbort);
      this.inFlight++;
      next.resolve();
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
    for (const waiter of this.queue) waiter.reject(new Error('Provider coordinator was reset.'));
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
