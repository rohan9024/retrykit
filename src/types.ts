export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 500 */
  baseDelayMs?: number;
  /** Maximum backoff ceiling delay in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Per-request timeout in milliseconds. Default: undefined */
  timeoutMs?: number;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504] */
  retryOnStatus?: number[];
  /** Custom condition to decide whether to retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback fired before every retry sleep */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal for immediate cancellation */
  signal?: AbortSignal;
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in milliseconds to wait before attempting recovery (HALF_OPEN). Default: 30000 */
  resetTimeoutMs?: number;
  /** Optional callback triggered on circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | [string, string][]
  | undefined;