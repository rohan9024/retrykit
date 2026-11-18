import { describe, it, expect } from 'vitest';
import { BudgetTracker, BudgetExceededError } from '../src/budget.js';

describe('BudgetTracker', () => {
  it('throws BudgetExceededError when max tokens exceeded', () => {
    const tracker = new BudgetTracker({ maxTokensPerRun: 1500 });

    tracker.recordAttempt(800);
    expect(() => tracker.recordAttempt(900)).toThrow(BudgetExceededError);
  });

  it('throws BudgetExceededError when estimated cost exceeded', () => {
    const tracker = new BudgetTracker({
      model: 'gpt-4o',
      maxCostUsdPerRun: 0.02, // $0.02 allows 2000 tokens ($0.0110) but trips on 50000 tokens ($0.2750)
    });

    expect(() => tracker.recordAttempt(2000)).not.toThrow();
    expect(() => tracker.recordAttempt(50000)).toThrow(BudgetExceededError);
  });
});