import { HeaderSource, QuotaBucket } from './types.js';

export const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504, 529];

export class RateLimitExceededError extends Error {
  public readonly delayMs: number;
  public readonly maxDelayMs: number;

  constructor(delayMs: number, maxDelayMs: number) {
    super(`Rate limit wait of ${delayMs}ms requested by server exceeds configured maximum of ${maxDelayMs}ms.`);
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

export function parseTimestampOrDelay(value: string, now: number = Date.now()): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // RFC 3339 / ISO 8601 Date
  if (trimmed.includes(':') || trimmed.includes('T') || trimmed.includes('-') || trimmed.includes(',')) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed - now);
    }
    return null;
  }

  // Duration with units ("15s", "600ms")
  const duration = parseDurationToMs(trimmed);
  if (duration !== null) {
    return duration;
  }

  // Pure numeric formats
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    if (Number.isNaN(num) || num < 0) return null;

    if (num > 100000000000) return Math.max(0, Math.floor(num - now)); // Epoch ms
    if (num > 1000000000) return Math.max(0, Math.floor(num * 1000 - now)); // Epoch sec
    return Math.max(0, Math.floor(num * 1000)); // Relative sec
  }

  return null;
}

/**
 * Calculates required wait across multi-dimensional quota buckets:
 * When an exhausted quota lacks reset info, incorporates fallback conservative delay.
 */
export function calculateRequiredWait(
  buckets: QuotaBucket[],
  fallbackDelayMs: number = 5000
): { requiredWaitMs: number; hasUnknownReset: boolean } {
  const exhausted = buckets.filter((b) => b.exhausted);
  if (exhausted.length === 0) return { requiredWaitMs: 0, hasUnknownReset: false };

  let maxKnownWait = 0;
  let hasUnknownReset = false;

  for (const b of exhausted) {
    if (b.resetAfterMs !== undefined && b.resetAfterMs > 0) {
      maxKnownWait = Math.max(maxKnownWait, b.resetAfterMs);
    } else {
      hasUnknownReset = true;
    }
  }

  const requiredWaitMs = hasUnknownReset ? Math.max(maxKnownWait, fallbackDelayMs) : maxKnownWait;
  return { requiredWaitMs, hasUnknownReset };
}

/**
 * Safely cancels discarded response bodies without shadowing the original error.
 */
export async function safelyCancelDiscardedBody(response: Response): Promise<void> {
  if (response.body && !response.bodyUsed) {
    try {
      await response.body.cancel();
    } catch {
      // Intentionally swallowed so underlying HTTP error is never masked
    }
  }
}

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
