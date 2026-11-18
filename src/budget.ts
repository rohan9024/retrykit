import { BudgetOptions } from './types.js';
import { MODEL_PRICING_PER_MILLION } from './providers.js';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Token & Cost Guard: Tracks token usage and financial cost across retries.
 */
export class BudgetTracker {
  private totalTokensUsed = 0;
  private totalEstimatedCostUsd = 0;

  constructor(private readonly config: BudgetOptions) {}

  public recordAttempt(tokens = 0): void {
    const estTokens =
      tokens > 0
        ? tokens
        : (this.config.estimatedPromptTokens || 500) + (this.config.estimatedCompletionTokens || 500);

    this.totalTokensUsed += estTokens;

    const pricing = this.config.model ? MODEL_PRICING_PER_MILLION[this.config.model] : undefined;
    if (pricing) {
      const promptRatio = 0.6;
      const compRatio = 0.4;
      const promptCost = (estTokens * promptRatio * pricing.prompt) / 1_000_000;
      const compCost = (estTokens * compRatio * pricing.completion) / 1_000_000;
      this.totalEstimatedCostUsd += promptCost + compCost;
    }

    if (this.config.maxTokensPerRun && this.totalTokensUsed > this.config.maxTokensPerRun) {
      throw new BudgetExceededError(
        `Exceeded token budget limit: Used ${this.totalTokensUsed} tokens (Max: ${this.config.maxTokensPerRun})`
      );
    }

    if (this.config.maxCostUsdPerRun && this.totalEstimatedCostUsd > this.config.maxCostUsdPerRun) {
      throw new BudgetExceededError(
        `Exceeded cost budget limit: $${this.totalEstimatedCostUsd.toFixed(4)} USD (Max: $${this.config.maxCostUsdPerRun.toFixed(4)})`
      );
    }
  }

  public getStats() {
    return {
      tokensUsed: this.totalTokensUsed,
      estimatedCostUsd: this.totalEstimatedCostUsd,
    };
  }
}

export interface RetryBudgetConfig {
  capacity?: number;
  refillPerSecond?: number;
  ttlMs?: number;
}

/**
 * Token Bucket Retry Budget used by RetryClient and coordinators.
 */
export class RetryBudget {
  public capacity: number;
  public refillPerSecond: number;
  public tokens: number;
  private lastRefill: number;

  constructor(options: RetryBudgetConfig = {}) {
    this.capacity = options.capacity ?? 20;
    this.refillPerSecond = options.refillPerSecond ?? 5;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
      this.lastRefill = now;
    }
  }

  public tryAcquire(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  public async acquire(count = 1): Promise<boolean> {
    return this.tryAcquire(count);
  }

  public canRetry(): boolean {
    return this.tryAcquire(1);
  }

  public recordRetry(): boolean {
    return this.tryAcquire(1);
  }

  public recordSuccess(): void {
    this.refill();
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }

  public recordAttempt(tokens = 0): void {
    this.tryAcquire(1);
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  public reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Factory for creating RetryBudget instances
 */
export function createRetryBudget(
  options?: RetryBudgetConfig | RetryBudget
): RetryBudget {
  if (options instanceof RetryBudget) {
    return options;
  }
  return new RetryBudget(options);
}