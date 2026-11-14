import {
  calculateRequiredWait,
  getHeader,
  parseTimestampOrDelay,
} from './engine.js';
import { HeaderSource, ProviderAdapter, QuotaBucket, RateLimitResult } from './types.js';

const registry: ProviderAdapter[] = [];

export function registerProvider(adapter: ProviderAdapter): void {
  const index = registry.findIndex((a) => a.name === adapter.name);
  if (index >= 0) {
    registry[index] = adapter;
  } else {
    registry.unshift(adapter); // Custom adapters take precedence
  }
}

export function findProviderAdapter(
  urlOrName: string,
  headers?: HeaderSource
): ProviderAdapter {
  let hostname = '';
  try {
    hostname = new URL(urlOrName).hostname.toLowerCase();
  } catch {
    hostname = urlOrName.toLowerCase();
  }

  for (const adapter of registry) {
    if (adapter.matches({ url: urlOrName, hostname, headers })) {
      return adapter;
    }
  }

  return genericAdapter;
}

// 1. OpenAI Adapter
export const openAIAdapter: ProviderAdapter = {
  name: 'openai',
  matches: ({ hostname, url }) => hostname.includes('api.openai.com') || url === 'openai',
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;
    const buckets: QuotaBucket[] = [];

    // Requests
    const remReq = getHeader(headers, 'x-ratelimit-remaining-requests');
    const resetReq = getHeader(headers, 'x-ratelimit-reset-requests');
    if (resetReq) {
      buckets.push({
        dimension: 'requests',
        remaining: remReq ? Number(remReq) : undefined,
        resetAfterMs: parseTimestampOrDelay(resetReq, now) ?? undefined,
        exhausted: remReq !== null ? Number(remReq) === 0 : true,
      });
    }

    // Tokens
    const remTok = getHeader(headers, 'x-ratelimit-remaining-tokens');
    const resetTok = getHeader(headers, 'x-ratelimit-reset-tokens');
    if (resetTok) {
      buckets.push({
        dimension: 'tokens',
        remaining: remTok ? Number(remTok) : undefined,
        resetAfterMs: parseTimestampOrDelay(resetTok, now) ?? undefined,
        exhausted: remTok !== null ? Number(remTok) === 0 : true,
      });
    }

    // Project Tokens
    const remProj = getHeader(headers, 'x-ratelimit-remaining-project-tokens');
    const resetProj = getHeader(headers, 'x-ratelimit-reset-project-tokens');
    if (resetProj) {
      buckets.push({
        dimension: 'project_tokens',
        remaining: remProj ? Number(remProj) : undefined,
        resetAfterMs: parseTimestampOrDelay(resetProj, now) ?? undefined,
        exhausted: remProj !== null ? Number(remProj) === 0 : true,
      });
    }

    // Fallback standard Retry-After
    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      buckets.push({
        dimension: 'generic',
        resetAfterMs: parseTimestampOrDelay(retryAfter, now) ?? undefined,
        exhausted: true,
      });
    }

    if (buckets.length === 0) return null;

    const delay = calculateRequiredWait(buckets);
    return {
      retryAfterMs: delay,
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
    };
  },
  classifyError: (error, status) => {
    if (status === 429) {
      return { retryable: true, reason: 'rate_limit_exceeded' };
    }
    if (status === 500 || status === 503) {
      return { retryable: true, reason: 'provider_overload' };
    }
    return { retryable: false, reason: 'unclassified' };
  },
};

// 2. Anthropic Adapter
export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',
  matches: ({ hostname, url }) => hostname.includes('api.anthropic.com') || url === 'anthropic',
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;
    const buckets: QuotaBucket[] = [];

    const dimensions: Array<{
      dim: QuotaBucket['dimension'];
      resetKey: string;
      remKey: string;
    }> = [
      { dim: 'requests', resetKey: 'anthropic-ratelimit-requests-reset', remKey: 'anthropic-ratelimit-requests-remaining' },
      { dim: 'tokens', resetKey: 'anthropic-ratelimit-tokens-reset', remKey: 'anthropic-ratelimit-tokens-remaining' },
      { dim: 'input_tokens', resetKey: 'anthropic-ratelimit-input-tokens-reset', remKey: 'anthropic-ratelimit-input-tokens-remaining' },
      { dim: 'output_tokens', resetKey: 'anthropic-ratelimit-output-tokens-reset', remKey: 'anthropic-ratelimit-output-tokens-remaining' },
    ];

    for (const { dim, resetKey, remKey } of dimensions) {
      const reset = getHeader(headers, resetKey);
      const rem = getHeader(headers, remKey);
      if (reset) {
        buckets.push({
          dimension: dim,
          remaining: rem ? Number(rem) : undefined,
          resetAfterMs: parseTimestampOrDelay(reset, now) ?? undefined,
          exhausted: rem !== null ? Number(rem) === 0 : true,
        });
      }
    }

    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      buckets.push({
        dimension: 'generic',
        resetAfterMs: parseTimestampOrDelay(retryAfter, now) ?? undefined,
        exhausted: true,
      });
    }

    if (buckets.length === 0) return null;

    return {
      retryAfterMs: calculateRequiredWait(buckets),
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
    };
  },
};

// 3. Groq Adapter
export const groqAdapter: ProviderAdapter = {
  name: 'groq',
  matches: ({ hostname, url }) => hostname.includes('api.groq.com') || url === 'groq',
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;
    const buckets: QuotaBucket[] = [];

    const remTokens = getHeader(headers, 'x-ratelimit-remaining-tokens');
    const resetTokens = getHeader(headers, 'x-ratelimit-reset-tokens');
    if (resetTokens) {
      buckets.push({
        dimension: 'tokens',
        remaining: remTokens ? Number(remTokens) : undefined,
        resetAfterMs: parseTimestampOrDelay(resetTokens, now) ?? undefined,
        exhausted: remTokens !== null ? Number(remTokens) === 0 : true,
      });
    }

    const remReq = getHeader(headers, 'x-ratelimit-remaining-requests');
    const resetReq = getHeader(headers, 'x-ratelimit-reset-requests');
    if (resetReq) {
      buckets.push({
        dimension: 'requests',
        remaining: remReq ? Number(remReq) : undefined,
        resetAfterMs: parseTimestampOrDelay(resetReq, now) ?? undefined,
        exhausted: remReq !== null ? Number(remReq) === 0 : true,
      });
    }

    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      buckets.push({
        dimension: 'generic',
        resetAfterMs: parseTimestampOrDelay(retryAfter, now) ?? undefined,
        exhausted: true,
      });
    }

    if (buckets.length === 0) return null;

    return {
      retryAfterMs: calculateRequiredWait(buckets),
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
    };
  },
};

// 4. Azure OpenAI Adapter
export const azureAdapter: ProviderAdapter = {
  name: 'azure-openai',
  matches: ({ hostname, url }) =>
    hostname.includes('.openai.azure.com') ||
    hostname.includes('.cognitiveservices.azure.com') ||
    url === 'azure',
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;

    const retryAfterMs = getHeader(headers, 'retry-after-ms');
    if (retryAfterMs) {
      const ms = parseFloat(retryAfterMs);
      if (!Number.isNaN(ms)) {
        return {
          retryAfterMs: Math.max(0, Math.floor(ms)),
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: ms, exhausted: true }],
        };
      }
    }

    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      const delay = parseTimestampOrDelay(retryAfter, now);
      if (delay !== null) {
        return {
          retryAfterMs: delay,
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: delay, exhausted: true }],
        };
      }
    }

    return null;
  },
};

// 5. Google Gemini Adapter
export const geminiAdapter: ProviderAdapter = {
  name: 'gemini',
  matches: ({ hostname, url }) =>
    hostname.includes('generativelanguage.googleapis.com') || url === 'gemini',
  parseRateLimit: (headers, now = Date.now()) => {
    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      const delay = parseTimestampOrDelay(retryAfter, now);
      if (delay !== null) {
        return {
          retryAfterMs: delay,
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: delay, exhausted: true }],
        };
      }
    }
    return null;
  },
  classifyError: (error) => {
    const err = error as {
      status?: string;
      code?: string | number;
      message?: string;
      error?: { status?: string; code?: string | number; message?: string };
    };
    const statusStr = err?.error?.status ?? err?.status;
    const codeStr = err?.error?.code ?? err?.code;
    const msg = err?.message ?? err?.error?.message ?? '';

    if (
      statusStr === 'RESOURCE_EXHAUSTED' ||
      codeStr === 'RESOURCE_EXHAUSTED' ||
      codeStr === 429 ||
      msg.includes('RESOURCE_EXHAUSTED')
    ) {
      return {
        retryable: true,
        reason: 'quota_exhausted',
        recommendedAction: 'check_billing_or_backoff',
      };
    }
    return { retryable: false, reason: 'unknown' };
  },
};

// 6. Generic RFC Fallback Adapter
export const genericAdapter: ProviderAdapter = {
  name: 'generic',
  matches: () => true,
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;
    const retryAfterMs = getHeader(headers, 'retry-after-ms');
    if (retryAfterMs) {
      const ms = parseFloat(retryAfterMs);
      if (!Number.isNaN(ms)) {
        return {
          retryAfterMs: Math.max(0, Math.floor(ms)),
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: ms, exhausted: true }],
        };
      }
    }

    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      const delay = parseTimestampOrDelay(retryAfter, now);
      if (delay !== null) {
        return {
          retryAfterMs: delay,
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: delay, exhausted: true }],
        };
      }
    }

    return null;
  },
};

// Register defaults
registry.push(openAIAdapter, anthropicAdapter, groqAdapter, azureAdapter, geminiAdapter);