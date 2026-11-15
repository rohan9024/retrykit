export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | [string, string][]
  | undefined;

export type RetrySafetyPolicy = 'safe-methods-only' | 'idempotent-methods-only' | 'all';

export type FailureCategory =
  | 'rate_limit'
  | 'provider_overload'
  | 'concurrency_limit'
  | 'network_error'
  | 'quota_exhausted'
  | 'billing_limit'
  | 'authentication'
  | 'invalid_request'
  | 'unknown';

export interface RetryDecision {
  retryable: boolean;
  category: FailureCategory;
  reason: string;
  retryAfterMs?: number;
  recommendedAction?: string;
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
  hasUnknownReset: boolean;
}

export interface TokenBucketBudgetOptions {
  /** Maximum retry tokens the bucket holds. Default: 20 */
  capacity?: number;
  /** Tokens replenished per second. Default: 5 */
  refillPerSecond?: number;
  /** Initial tokens upon creation. Default: capacity */
  initialTokens?: number;
}

export interface CoreRetryOptions {
  /** Maximum retry attempts. Default: 3 */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default: 500 */
  baseDelayMs?: number;
  /** Maximum backoff delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Hard deadline for the entire operation in ms (includes queueing and backoffs) */
  maxElapsedTimeMs?: number;
  /** Custom condition to decide whether to retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback fired before every retry sleep */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal for immediate cancellation */
  signal?: AbortSignal;
}

export type RetryOptions = CoreRetryOptions;

export interface FetchRetryOptions extends CoreRetryOptions {
  /** Per-attempt response acquisition timeout in ms */
  timeoutMs?: number;
  /** Action when provider rate limit wait exceeds maxDelayMs. Default: 'throw' */
  exceedsMaxDelayBehavior?: 'throw' | 'defer' | 'clamp';
  /** HTTP methods retry safety policy. Default: 'all' */
  retrySafety?: RetrySafetyPolicy;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504] */
  retryOnStatus?: number[];
  /** Explicit provider hint (e.g. 'openai', 'anthropic') */
  providerHint?: string;
}

export interface ResumableStreamOptions<T, C = unknown> extends CoreRetryOptions {
  /** Stream factory receiving the checkpoint cursor of the last processed chunk */
  createStream: (checkpoint: C | undefined, attempt: number, signal?: AbortSignal) => Promise<AsyncIterable<T>>;
  /** Extract a resumption cursor from an acknowledged chunk */
  getCheckpoint?: (chunk: T, previousCheckpoint: C | undefined) => C;
  /** Initial checkpoint cursor */
  initialCheckpoint?: C;
  /** Explicit opt-in if stream restarts from beginning and consumer handles deduplication */
  allowRestartWithoutCheckpoint?: boolean;
  /** Per-chunk or acquisition timeout in ms */
  timeoutMs?: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
  shouldCountFailure?: (error: unknown) => boolean;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface ProviderContext {
  url: string;
  hostname: string;
  headers?: HeaderSource;
  providerHint?: string;
}

export interface ProviderAdapter {
  name: string;
  matches: (context: ProviderContext) => boolean;
  parseRateLimit: (headers: HeaderSource, now?: number) => RateLimitResult | null;
  classifyError?: (error: unknown, status?: number) => RetryDecision;
}

export interface CoordinatorOptions {
  /** Max concurrent network attempts in-flight. Default: 10 */
  maxConcurrentAttempts?: number;
  /** Max queue length before rejecting. Default: 500 */
  maxQueueSize?: number;
  /** Max time in ms a request can wait in queue. Default: 30000 */
  maxQueueWaitMs?: number;
  /** Provider name for quota isolation */
  provider?: string;
}

export interface RetryClientOptions {
  provider?: string | ProviderAdapter;
  scope?: string;
  concurrency?: number;
  maxQueueSize?: number;
  maxQueueWaitMs?: number;
  circuitBreaker?: CircuitBreakerOptions | boolean;
  budget?: TokenBucketBudgetOptions | boolean;
  retry?: FetchRetryOptions;
}