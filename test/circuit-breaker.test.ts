import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('allows successful executions under CLOSED state', async () => {
    const breaker = new CircuitBreaker();
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('trips to OPEN state after reaching failureThreshold', async () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({ failureThreshold: 2, onStateChange });

    const failingTask = async () => {
      throw new Error('API Outage');
    };

    await expect(breaker.execute(failingTask)).rejects.toThrow('API Outage');
    await expect(breaker.execute(failingTask)).rejects.toThrow('API Outage');

    expect(breaker.getState()).toBe('OPEN');
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');

    // Subsequent calls fast-fail immediately
    await expect(breaker.execute(async () => 'never called')).rejects.toThrow(CircuitBreakerOpenError);
  });
});