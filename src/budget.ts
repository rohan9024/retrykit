import { TokenBucketBudgetOptions } from './types.js';

export class RetryBudgetExceededError extends Error {
  constructor(message: string = 'Shared retry budget exhausted. Request fast-failed.') {
    super(message);
    this.name = 'RetryBudgetExceededError';
  }
}

/**
 * Token-bucket retry budget shared across independent requests and clients
 * to prevent retry amplification storms.
 */
export class TokenBucketRetryBudget {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;

  constructor(options: TokenBucketBudgetOptions = {}) {
    this.capacity = options.capacity ?? 20;
    this.refillPerSecond = options.refillPerSecond ?? 5;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  public tryAcquire(cost: number = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  public acquire(cost: number = 1): void {
    if (!this.tryAcquire(cost)) {
      throw new RetryBudgetExceededError();
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSecond);
      this.lastRefill = now;
    }
  }

  public reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

export function createRetryBudget(options?: TokenBucketBudgetOptions): TokenBucketRetryBudget {
  return new TokenBucketRetryBudget(options);
}