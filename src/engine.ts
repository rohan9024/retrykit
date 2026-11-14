import { HeaderSource, QuotaBucket, RetryBudget } from './types.js';

export const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

export class RateLimitExceededError extends Error {
  public readonly delayMs: number;
  public readonly maxDelayMs: number;

  constructor(delayMs: number, maxDelayMs: number) {
    super(
      `Rate limit wait of ${delayMs}ms requested by server exceeds configured maximum of ${maxDelayMs}ms.`
    );
    this.name = 'RateLimitExceededError';
    this.delayMs = delayMs;
    this.maxDelayMs = maxDelayMs;
  }
}

export class DeadlineExceededError extends Error {
  constructor(elapsedMs: number, maxElapsedTimeMs: number) {
    super(`Operation exceeded total deadline: ${elapsedMs}ms > ${maxElapsedTimeMs}ms.`);
    this.name = 'DeadlineExceededError';
  }
}

export class RetryBudgetExceededError extends Error {
  constructor() {
    super('Shared retry budget exhausted. Request failed fast.');
    this.name = 'RetryBudgetExceededError';
  }
}

/**
 * Sliding window retry budget tracker to prevent retry storms.
 */
export class RetryBudgetTracker {
  private timestamps: number[] = [];
  private readonly maxExtraAttempts: number;
  private readonly windowMs: number;

  constructor(budget: RetryBudget) {
    this.maxExtraAttempts = budget.maxExtraAttempts;
    this.windowMs = budget.windowMs;
  }

  public canRetry(now: number = Date.now()): boolean {
    this.prune(now);
    return this.timestamps.length < this.maxExtraAttempts;
  }

  public recordRetry(now: number = Date.now()): void {
    this.prune(now);
    this.timestamps.push(now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }
}

/**
 * Calculates exponential backoff with full jitter:
 * sleepMs = min(maxDelayMs, baseDelayMs * 2 ** attempt) * Math.random()
 */
export function computeJitterDelay(
  attempt: number,
  baseDelayMs: number = 500,
  maxDelayMs: number = 30000
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const ceiling = Math.min(maxDelayMs, exponential);
  return Math.floor(ceiling * Math.random());
}

/**
 * Safely extracts a header value case-insensitively across Headers, records, or tuples.
 */
export function getHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(target);
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === target) return value;
    }
    return null;
  }

  if (typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === target) {
        const val = (headers as Record<string, unknown>)[key];
        if (Array.isArray(val)) return val[0] ?? null;
        return typeof val === 'string' ? val : String(val);
      }
    }
  }

  return null;
}

/**
 * Strictly parses duration strings (e.g., "600ms", "10s", "2m", "1m30s").
 */
export function parseDurationToMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const regex = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi;
  let match: RegExpExecArray | null;
  let totalMs = 0;
  let matched = false;

  while ((match = regex.exec(trimmed)) !== null) {
    matched = true;
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'ms': totalMs += amount; break;
      case 's': totalMs += amount * 1000; break;
      case 'm': totalMs += amount * 60 * 1000; break;
      case 'h': totalMs += amount * 60 * 60 * 1000; break;
      case 'd': totalMs += amount * 24 * 60 * 60 * 1000; break;
    }
  }

  return matched ? Math.max(0, Math.floor(totalMs)) : null;
}

/**
 * Deterministically parses a header value representing a timestamp or delay.
 */
export function parseTimestampOrDelay(value: string, now: number = Date.now()): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Date format (RFC 3339, ISO 8601, RFC 1123)
  if (trimmed.includes(':') || trimmed.includes('T') || trimmed.includes('-') || trimmed.includes(',')) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed - now);
    }
  }

  // Relative duration string with units ("15s", "600ms")
  const duration = parseDurationToMs(trimmed);
  if (duration !== null) {
    return duration;
  }

  // Pure numeric formats
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    if (Number.isNaN(num)) return null;

    // Epoch milliseconds (> 1e11)
    if (num > 100000000000) {
      return Math.max(0, Math.floor(num - now));
    }
    // Epoch seconds (> 1e9)
    if (num > 1000000000) {
      return Math.max(0, Math.floor(num * 1000 - now));
    }
    // Relative seconds
    return Math.max(0, Math.floor(num * 1000));
  }

  return null;
}

/**
 * Calculates required wait across multi-dimensional quota buckets:
 * D_wait = max(D_tokens, D_requests) for all exhausted dimensions.
 */
export function calculateRequiredWait(buckets: QuotaBucket[]): number {
  const exhausted = buckets.filter((b) => b.exhausted && b.resetAfterMs !== undefined);
  if (exhausted.length === 0) return 0;
  return Math.max(0, ...exhausted.map((b) => b.resetAfterMs!));
}

/**
 * Transient network error detection including Node/Undici socket and timeout errors.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  const code = (error as { code?: string }).code;

  if (error.name === 'TypeError' && msg.includes('fetch failed')) return true;

  const transientCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ];

  if (code && transientCodes.includes(code)) return true;

  return (
    msg.includes('network error') ||
    msg.includes('socket hang up') ||
    msg.includes('terminated') ||
    msg.includes('econnreset')
  );
}

/**
 * Promisified sleep respecting AbortSignal cancellation.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}