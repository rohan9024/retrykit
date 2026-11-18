import { ProviderName, RateLimitInfo } from './types.js';

const FATAL_SUBSTRINGS = [
  'invalid_api_key',
  'incorrect api key',
  'account_deactivated',
  'billing_not_active',
  'permission_denied',
  'unauthorized',
  'model_not_found',
  'insufficient_quota',
  'credit_balance_too_low',
];

const CONTEXT_OVERFLOW_SUBSTRINGS = [
  'context_length_exceeded',
  'maximum context length',
  'prompt is too long',
  'string_too_long',
  'too many tokens',
  'token limit exceeded',
];

// Approximate cost per 1M tokens (USD) for budget guard
export const MODEL_PRICING_PER_MILLION: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o': { prompt: 2.5, completion: 10.0 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'claude-3-5-sonnet': { prompt: 3.0, completion: 15.0 },
  'claude-3-5-haiku': { prompt: 0.8, completion: 4.0 },
  'llama-3.3-70b': { prompt: 0.59, completion: 0.79 },
  'deepseek-chat': { prompt: 0.14, completion: 0.28 },
  'gemini-1.5-flash': { prompt: 0.075, completion: 0.3 },
  'gemini-1.5-pro': { prompt: 1.25, completion: 5.0 },
};

export function normalizeHeaders(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof value === 'string') {
        result[key.toLowerCase()] = value;
      } else if (Array.isArray(value) && typeof value[0] === 'string') {
        result[key.toLowerCase()] = value[0];
      }
    }
  }

  return result;
}

function parseTimeString(raw: string): number | null {
  const trimmed = raw.trim();
  const num = Number(trimmed);
  if (!Number.isNaN(num)) return num * 1000;

  let totalMs = 0;
  const mMatch = trimmed.match(/(\d+(?:\.\d+)?)m(?:in)?/);
  const sMatch = trimmed.match(/(\d+(?:\.\d+)?)s/);
  const msMatch = trimmed.match(/(\d+(?:\.\d+)?)ms/);

  if (msMatch) totalMs += parseFloat(msMatch[1]);
  if (sMatch) totalMs += parseFloat(sMatch[1]) * 1000;
  if (mMatch) totalMs += parseFloat(mMatch[1]) * 60000;

  return totalMs > 0 ? totalMs : null;
}

function parseHttpRetryAfter(value: string): number | null {
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

export function extractRateLimitInfo(error: unknown, fallbackProvider: ProviderName = 'generic'): RateLimitInfo {
  const err = error as Record<string, unknown> | null;
  if (!err) return { isRateLimited: false };

  const message = String(err.message || '').toLowerCase();
  const rawStatus = err.status || err.statusCode || (err.response as Record<string, unknown>)?.status;
  const statusCode = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus) || 0;

  // Context Overflow Detection
  for (const overflow of CONTEXT_OVERFLOW_SUBSTRINGS) {
    if (message.includes(overflow)) {
      return { isRateLimited: false, isContextOverflow: true, fatalReason: overflow };
    }
  }

  // Fatal Auth/Permission Detection
  for (const fatal of FATAL_SUBSTRINGS) {
    if (message.includes(fatal)) {
      return { isRateLimited: false, isFatal: true, fatalReason: fatal };
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return { isRateLimited: false, isFatal: true, fatalReason: `HTTP_${statusCode}` };
  }

  const rawHeaders =
    err.headers ||
    (err.response as Record<string, unknown>)?.headers ||
    ((error as Record<string, unknown>)?.response as Record<string, unknown>)?.headers;
  const headers = normalizeHeaders(rawHeaders);

  let retryAfterMs: number | undefined;
  let isRateLimited = statusCode === 429;

  // RFC Standard
  if (headers['retry-after']) {
    const parsed = parseHttpRetryAfter(headers['retry-after']);
    if (parsed !== null) retryAfterMs = parsed;
    isRateLimited = true;
  }

  // Millisecond precision
  if (headers['retry-after-ms']) {
    const ms = Number(headers['retry-after-ms']);
    if (!Number.isNaN(ms)) {
      retryAfterMs = ms;
      isRateLimited = true;
    }
  }

  // OpenAI Reset Headers
  if (headers['x-ratelimit-reset-requests']) {
    const parsed = parseTimeString(headers['x-ratelimit-reset-requests']);
    if (parsed) {
      retryAfterMs = Math.max(retryAfterMs || 0, parsed);
      isRateLimited = true;
    }
  }
  if (headers['x-ratelimit-reset-tokens']) {
    const parsed = parseTimeString(headers['x-ratelimit-reset-tokens']);
    if (parsed) {
      retryAfterMs = Math.max(retryAfterMs || 0, parsed);
      isRateLimited = true;
    }
  }

  // Anthropic Reset Headers
  if (headers['anthropic-ratelimit-unified-reset-after']) {
    const parsed = parseTimeString(headers['anthropic-ratelimit-unified-reset-after']);
    if (parsed) {
      retryAfterMs = parsed;
      isRateLimited = true;
    }
  }

  // Gemini / Vertex Engine
  if (
    message.includes('resource_exhausted') ||
    message.includes('rate_limit_exceeded') ||
    message.includes('quota exceeded')
  ) {
    isRateLimited = true;
  }

  return {
    isRateLimited,
    retryAfterMs,
    remainingRequests: headers['x-ratelimit-remaining-requests'] ? Number(headers['x-ratelimit-remaining-requests']) : undefined,
    remainingTokens: headers['x-ratelimit-remaining-tokens'] ? Number(headers['x-ratelimit-remaining-tokens']) : undefined,
  };
}