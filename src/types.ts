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
}