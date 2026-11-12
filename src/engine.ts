import { HeaderSource } from './types.js';

export const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

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
 * Safely extracts a header value case-insensitively across Headers instances, records, or tuples.
 */
export function getHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;

  const target = name.toLowerCase();

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(target);
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === target) {
        return value;
      }
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
 * Parses duration strings returned by LLM APIs (e.g. "600ms", "10s", "2m", "1m30s", "1.5").
 */
export function parseDurationToMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const sec = parseFloat(trimmed);
    return isNaN(sec) ? null : Math.max(0, Math.floor(sec * 1000));
  }

  const regex = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gi;
  let match: RegExpExecArray | null;
  let totalMs = 0;
  let matched = false;

  while ((match = regex.exec(trimmed)) !== null) {
    matched = true;
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'ms':
        totalMs += amount;
        break;
      case 's':
        totalMs += amount * 1000;
        break;
      case 'm':
        totalMs += amount * 60 * 1000;
        break;
      case 'h':
        totalMs += amount * 60 * 60 * 1000;
        break;
      case 'd':
        totalMs += amount * 24 * 60 * 60 * 1000;
        break;
    }
  }

  return matched ? Math.max(0, Math.floor(totalMs)) : null;
}

/**
 * Exhaustively checks provider headers across:
 * - RFC 7231 / RFC 6585 standard `retry-after`
 * - OpenAI: `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`
 * - Anthropic: `anthropic-ratelimit-requests-reset`, `anthropic-ratelimit-tokens-reset`
 * - Groq / DeepSeek / Mistral: `x-ratelimit-reset-total`, `retry-after-ms`
 */
export function parseRateLimitDelay(headers: HeaderSource): number | null {
  if (!headers) return null;

  // 1. Direct milliseconds header (Groq, custom proxies)
  const retryAfterMs = getHeader(headers, 'retry-after-ms');
  if (retryAfterMs) {
    const parsed = parseFloat(retryAfterMs);
    if (!isNaN(parsed)) return Math.max(0, Math.floor(parsed));
  }

  // 2. Standard Retry-After (seconds or RFC 1123 HTTP Date)
  const retryAfter = getHeader(headers, 'retry-after');
  if (retryAfter) {
    if (/^\d+(\.\d+)?$/.test(retryAfter.trim())) {
      const sec = parseFloat(retryAfter.trim());
      if (!isNaN(sec)) return Math.max(0, Math.floor(sec * 1000));
    }

    const parsedDate = Date.parse(retryAfter);
    if (!isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
  }

  // 3. Provider-specific reset headers
  const candidateKeys = [
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'anthropic-ratelimit-requests-reset',
    'anthropic-ratelimit-tokens-reset',
    'x-ratelimit-reset-total',
  ];

  for (const key of candidateKeys) {
    const raw = getHeader(headers, key);
    if (raw) {
      const ms = parseDurationToMs(raw);
      if (ms !== null) return ms;

      // Handle epoch timestamp formats
      const epochSec = parseFloat(raw);
      if (!isNaN(epochSec) && epochSec > 1000000000) {
        return Math.max(0, Math.floor(epochSec * 1000 - Date.now()));
      }
    }
  }

  return null;
}

/**
 * Detects transient network drop errors across Node, Bun, Deno, and browsers.
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
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
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
 * Promisified sleep that respects AbortSignal cancellation.
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