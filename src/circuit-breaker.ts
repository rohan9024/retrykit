import { CircuitBreakerOptions, CircuitState } from './types.js';

export class CircuitBreakerOpenError extends Error {
  constructor(message: string = 'Circuit breaker is OPEN. Fast-failing requests.') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Enterprise-grade Circuit Breaker with atomic half-open probe reservation
 * and configurable failure classification.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenCallsInFlight: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly shouldCountFailure: (error: unknown) => boolean;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;
    this.onStateChange = options.onStateChange;

    this.shouldCountFailure =
      options.shouldCountFailure ??
      ((error: unknown) => {
        // Do not trip the breaker on client-side aborts or circuit breaker rejections
        if (error instanceof Error && (error.name === 'AbortError' || error.name === 'CircuitBreakerOpenError')) {
          return false;
        }
        return true;
      });
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new CircuitBreakerOpenError();
    }

    if (currentState === 'HALF_OPEN') {
      // Synchronously reserve a probe slot before awaiting
      if (this.halfOpenCallsInFlight >= this.halfOpenMaxCalls) {
        throw new CircuitBreakerOpenError('Circuit breaker is HALF_OPEN and test probe is in progress.');
      }
      this.halfOpenCallsInFlight++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      if (this.shouldCountFailure(error)) {
        this.recordFailure();
      } else if (currentState === 'HALF_OPEN') {
        // If the probe failed with a non-infrastructure error (e.g. client abort), release probe slot
        this.halfOpenCallsInFlight = Math.max(0, this.halfOpenCallsInFlight - 1);
      }
      throw error;
    }
  }

  /**
   * Helper for fetch calls to treat HTTP 500+ or 429 as circuit breaker failures.
   */
  public async executeFetch(
    fn: () => Promise<Response>,
    isFailureResponse: (res: Response) => boolean = (res) => res.status >= 500 || res.status === 429
  ): Promise<Response> {
    return this.execute(async () => {
      const response = await fn();
      if (isFailureResponse(response)) {
        throw new Error(`HTTP ${response.status} classified as infrastructure failure.`);
      }
      return response;
    });
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCallsInFlight = 0;
      this.transitionTo('CLOSED');
    }
    this.failureCount = 0;
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.halfOpenCallsInFlight = 0;
    this.transitionTo('OPEN');
  }

  private transitionTo(nextState: CircuitState): void {
    const prevState = this.state;
    if (prevState !== nextState) {
      this.state = nextState;
      this.onStateChange?.(prevState, nextState);
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenCallsInFlight = 0;
  }
}