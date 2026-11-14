export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | [string, string][]
  | undefined;

export type RetrySafetyPolicy = 'safe-methods-only' | 'all';

export interface RetryBudget {
  /** Maximum extra retry attempts allowed across all operations in the window */
  maxExtraAttempts: number;
  /** Sliding window duration in milliseconds */
  windowMs: number;
}

export interface CoreRetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 500 */
  baseDelayMs?: number;
  /** Maximum backoff ceiling delay in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Maximum total elapsed time for the entire operation. Default: undefined */
  maxElapsedTimeMs?: number;
  /** Shared retry budget to prevent retry amplification storms */
  retryBudget?: RetryBudget;
  /** Custom condition to decide whether to retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback fired before every retry sleep */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal for immediate cancellation */
  signal?: AbortSignal;
}

export interface FetchRetryOptions extends CoreRetryOptions {
  /** Per-attempt response acquisition timeout in milliseconds */
  timeoutMs?: number;
  /** Action when provider rate-limit delay exceeds maxDelayMs. Default: 'throw' */
  exceedsMaxDelayBehavior?: 'throw' | 'clamp';
  /** HTTP methods retry safety policy. Default: 'all' */
  retrySafety?: RetrySafetyPolicy;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504] */
  retryOnStatus?: number[];
  /** Optional provider name override for custom adapter selection */
  provider?: string;
}

export interface ResumableStreamOptions<T, C = unknown> extends CoreRetryOptions {
  /** Stream factory receiving the checkpoint cursor from the last acknowledged chunk */
  createStream: (checkpoint: C | undefined, attempt: number, signal?: AbortSignal) => Promise<AsyncIterable<T>>;
  /** Extract a resumption cursor/checkpoint from a chunk */
  getCheckpoint?: (chunk: T, previousCheckpoint: C | undefined) => C;
  /** Initial checkpoint cursor */
  initialCheckpoint?: C;
  /** Explicit opt-in if stream factory restarts from beginning and caller handles deduplication */
  allowRestartWithoutCheckpoint?: boolean;
  /** Per-chunk or acquisition timeout in milliseconds */
  timeoutMs?: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in milliseconds to wait before attempting recovery (HALF_OPEN). Default: 30000 */
  resetTimeoutMs?: number;
  /** Maximum concurrent probe calls in HALF_OPEN state. Default: 1 */
  halfOpenMaxCalls?: number;
  /** Determines if an error counts toward tripping the circuit breaker */
  shouldCountFailure?: (error: unknown) => boolean;
  /** Optional callback triggered on circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface QuotaBucket {
  dimension: 'requests' | 'tokens' | 'input_tokens' | 'output_tokens' | 'project_tokens' | 'generic';
  remaining?: number;
  resetAfterMs?: number;
  exhausted: boolean;
}

export interface RateLimitResult {
  retryAfterMs: number;
  exhaustedDimensions: string[];
  buckets: QuotaBucket[];
}

export interface ProviderAdapter {
  name: string;
  matches: (context: { url: string; hostname: string; headers?: HeaderSource }) => boolean;
  parseRateLimit: (headers: HeaderSource, now?: number) => RateLimitResult | null;
  classifyError?: (error: unknown, status?: number) => {
    retryable: boolean;
    reason: string;
    recommendedAction?: string;
  };
}

export interface CoordinatorOptions {
  /** Max concurrent requests allowed in flight. Default: 10 */
  concurrency?: number;
  /** Provider name for quota isolation */
  provider?: string;
}