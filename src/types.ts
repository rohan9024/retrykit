export type JitterType = 'none' | 'full' | 'equal' | 'decorrelated';
export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';
export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'cohere'
  | 'generic';

export interface BackoffOptions {
  strategy?: BackoffStrategy;
  initialMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: JitterType;
}

export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfterMs?: number;
  isFatal?: boolean;
  fatalReason?: string;
  isContextOverflow?: boolean;
  remainingRequests?: number;
  remainingTokens?: number;
}

export interface RetryState {
  attempt: number;
  maxRetries: number;
  error: unknown;
  delayMs: number;
  totalTimeMs: number;
  currentKey?: string;
}

export interface BudgetOptions {
  maxTokensPerRun?: number;
  maxCostUsdPerRun?: number;
  estimatedPromptTokens?: number;
  estimatedCompletionTokens?: number;
  model?: string;
}

export interface CompactionMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface CompactionOptions {
  enabled?: boolean;
  targetReductionRatio?: number; // 0.1 to 0.9 (default 0.3 = cut 30% of older context)
  preserveSystemPrompt?: boolean;
  preserveLastNMessages?: number;
}

export interface RetryOptions<T = unknown> {
  maxRetries?: number;
  timeoutMs?: number;
  backoff?: BackoffOptions;
  provider?: ProviderName;
  signal?: AbortSignal;
  attemptTimeoutMs?: number;
  totalDeadlineMs?: number;
  keys?: string[];
  budget?: BudgetOptions;
  compaction?: CompactionOptions;
  deduplicate?: boolean; // SingleFlight deduplication
  deduplicationKey?: string;
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (state: RetryState) => void | Promise<void>;
  onKeyRotate?: (oldKey: string, newKey: string, waitMs: number) => void;
  onCompacted?: (originalLength: number, compactedLength: number) => void;
  onSuccess?: (result: T, attempts: number, durationMs: number) => void;
  onError?: (error: unknown, attempts: number) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
  halfOpenMaxCalls?: number;
  shouldCountFailure?: (error: unknown) => boolean;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface FallbackStep<T> {
  name: string;
  execute: () => Promise<T>;
  options?: RetryOptions<T>;
}

export interface FallbackReport<T> {
  result: T;
  stepName: string;
  stepIndex: number;
  attemptsUsed: number;
  totalDurationMs: number;
  errorsEncountered: Array<{ stepName: string; error: unknown }>;
}

export interface StreamRetryOptions {
  maxRetries?: number;
  chunkTimeoutMs?: number;
  backoff?: BackoffOptions;
  signal?: AbortSignal;
  onChunk?: (chunk: unknown) => void;
  onStall?: (attempt: number) => void;
  getCheckpoint?: (chunk: unknown) => unknown;
}
export type HeaderSource = Headers | Record<string, string | string[] | undefined> | [string, string][] | undefined;
export type RetrySafetyPolicy = 'safe-methods-only' | 'idempotent-methods-only' | 'all';
export type FailureCategory = 'rate_limit' | 'provider_overload' | 'concurrency_limit' | 'network_error' | 'quota_exhausted' | 'billing_limit' | 'authentication' | 'invalid_request' | 'unknown';
export interface RetryDecision { retryable: boolean; category: FailureCategory; reason: string; retryAfterMs?: number; recommendedAction?: string; }
export interface QuotaBucket { dimension: 'requests' | 'tokens' | 'input_tokens' | 'output_tokens' | 'project_tokens' | 'generic'; remaining?: number; resetAfterMs?: number; exhausted: boolean; }
export interface RateLimitResult { retryAfterMs: number; exhaustedDimensions: string[]; buckets: QuotaBucket[]; hasUnknownReset: boolean; }
export interface TokenBucketBudgetOptions { capacity?: number; refillPerSecond?: number; initialTokens?: number; }
export interface RetryHookInfo { attempt: number; error: unknown; delayMs: number; }
export type OnRetryCallback = (infoOrError: RetryHookInfo | any, attempt?: number, delayMs?: number) => void | Promise<void>;
export interface CoreRetryOptions { retries?: number; baseDelayMs?: number; maxDelayMs?: number; maxElapsedTimeMs?: number; shouldRetry?: (error: unknown, attempt: number) => boolean; onRetry?: OnRetryCallback; signal?: AbortSignal; }
export interface FetchRetryOptions extends CoreRetryOptions { timeoutMs?: number; exceedsMaxDelayBehavior?: 'throw' | 'defer' | 'clamp'; retrySafety?: RetrySafetyPolicy; retryOnStatus?: number[]; providerHint?: string; }
export interface ProviderContext { url: string; hostname: string; headers?: HeaderSource; providerHint?: string; }
export interface ProviderAdapter { name: string; matches: (context: ProviderContext) => boolean; parseRateLimit: (headers: HeaderSource, now?: number) => RateLimitResult | null; classifyError?: (error: unknown, status?: number) => RetryDecision; }
export interface ResumableStreamOptions<T, C = unknown> extends CoreRetryOptions { createStream: (checkpoint: C | undefined, attempt: number, signal?: AbortSignal) => Promise<AsyncIterable<T>>; getCheckpoint?: (chunk: T, previousCheckpoint: C | undefined) => C; initialCheckpoint?: C; allowRestartWithoutCheckpoint?: boolean; timeoutMs?: number; }
export interface RetryClientOptions { provider?: string | ProviderAdapter; scope?: string; concurrency?: number; maxQueueSize?: number; maxQueueWaitMs?: number; circuitBreaker?: CircuitBreakerOptions | boolean; budget?: TokenBucketBudgetOptions | boolean; retry?: FetchRetryOptions; }

