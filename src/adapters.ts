import { calculateRequiredWait, getHeader, parseTimestampOrDelay } from './engine.js';
import { HeaderSource, ProviderAdapter, ProviderContext, QuotaBucket, RateLimitResult, RetryDecision } from './types.js';

export function matchesDomain(hostname: string, targetDomain: string): boolean {
  return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
}

// 1. OpenAI Adapter
export const openAIAdapter: ProviderAdapter = {
  name: 'openai',
  matches: ({ hostname, providerHint }) =>
    matchesDomain(hostname, 'openai.com') || providerHint === 'openai',
  parseRateLimit: (headers, now = Date.now()) => {
    if (!headers) return null;
    const buckets: QuotaBucket[] = [];

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

    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      buckets.push({
        dimension: 'generic',
        resetAfterMs: parseTimestampOrDelay(retryAfter, now) ?? undefined,
        exhausted: true,
      });
    }

    if (buckets.length === 0) return null;

    const { requiredWaitMs, hasUnknownReset } = calculateRequiredWait(buckets);
    return {
      retryAfterMs: requiredWaitMs,
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
      hasUnknownReset,
    };
  },
  classifyError: (error, status) => {
    if (status === 429) {
      return { retryable: true, category: 'rate_limit', reason: 'requests_or_tokens_exceeded' };
    }
    if (status === 500 || status === 503) {
      return { retryable: true, category: 'provider_overload', reason: 'openai_service_unavailable' };
    }
    return { retryable: false, category: 'unknown', reason: 'unclassified_error' };
  },
};

// 2. Anthropic Adapter
export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',
  matches: ({ hostname, providerHint }) =>
    matchesDomain(hostname, 'anthropic.com') || providerHint === 'anthropic',
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

    const { requiredWaitMs, hasUnknownReset } = calculateRequiredWait(buckets);
    return {
      retryAfterMs: requiredWaitMs,
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
      hasUnknownReset,
    };
  },
};

// 3. Groq Adapter
export const groqAdapter: ProviderAdapter = {
  name: 'groq',
  matches: ({ hostname, providerHint }) =>
    matchesDomain(hostname, 'groq.com') || providerHint === 'groq',
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

    const { requiredWaitMs, hasUnknownReset } = calculateRequiredWait(buckets);
    return {
      retryAfterMs: requiredWaitMs,
      exhaustedDimensions: buckets.filter((b) => b.exhausted).map((b) => b.dimension),
      buckets,
      hasUnknownReset,
    };
  },
};

// 4. Azure OpenAI Adapter
export const azureAdapter: ProviderAdapter = {
  name: 'azure-openai',
  matches: ({ hostname, providerHint }) =>
    matchesDomain(hostname, 'openai.azure.com') ||
    matchesDomain(hostname, 'cognitiveservices.azure.com') ||
    providerHint === 'azure-openai',
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
          hasUnknownReset: false,
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
          hasUnknownReset: false,
        };
      }
    }

    return null;
  },
};

// 5. Google Gemini Adapter
export const geminiAdapter: ProviderAdapter = {
  name: 'gemini',
  matches: ({ hostname, providerHint }) =>
    matchesDomain(hostname, 'generativelanguage.googleapis.com') || providerHint === 'gemini',
  parseRateLimit: (headers, now = Date.now()) => {
    const retryAfter = getHeader(headers, 'retry-after');
    if (retryAfter) {
      const delay = parseTimestampOrDelay(retryAfter, now);
      if (delay !== null) {
        return {
          retryAfterMs: delay,
          exhaustedDimensions: ['generic'],
          buckets: [{ dimension: 'generic', resetAfterMs: delay, exhausted: true }],
          hasUnknownReset: false,
        };
      }
    }
    return null;
  },
  classifyError: (error): RetryDecision => {
    const err = error as {
      status?: string;
      code?: string | number;
      message?: string;
      error?: { status?: string; code?: string | number; message?: string };
    };

    const statusStr = err?.error?.status ?? err?.status;
    const codeStr = err?.error?.code ?? err?.code;
    const msg = (err?.message ?? err?.error?.message ?? '').toLowerCase();

    if (msg.includes('billing') || msg.includes('credit') || msg.includes('spending cap')) {
      return {
        retryable: false,
        category: 'billing_limit',
        reason: 'gemini_billing_or_credit_exhausted',
        recommendedAction: 'check_google_cloud_billing',
      };
    }

    if (msg.includes('daily limit') || msg.includes('quota exceeded for day')) {
      return {
        retryable: false,
        category: 'quota_exhausted',
        reason: 'gemini_daily_quota_exhausted',
        recommendedAction: 'wait_for_daily_reset_or_upgrade',
      };
    }

    if (
      statusStr === 'RESOURCE_EXHAUSTED' ||
      codeStr === 'RESOURCE_EXHAUSTED' ||
      codeStr === 429 ||
      msg.includes('resource_exhausted')
    ) {
      return {
        retryable: true,
        category: 'rate_limit',
        reason: 'gemini_rate_limit_exceeded',
        recommendedAction: 'backoff_and_retry',
      };
    }

    return { retryable: false, category: 'unknown', reason: 'unclassified_gemini_error' };
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
          hasUnknownReset: false,
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
          hasUnknownReset: false,
        };
      }
    }

    return null;
  },
};

export class ProviderRegistry {
  private adapters: ProviderAdapter[] = [];

  constructor(initialAdapters: ProviderAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  public register(adapter: ProviderAdapter): void {
    const idx = this.adapters.findIndex((a) => a.name === adapter.name);
    if (idx >= 0) {
      this.adapters[idx] = adapter;
    } else {
      this.adapters.unshift(adapter);
    }
  }

  public unregister(name: string): boolean {
    const initial = this.adapters.length;
    this.adapters = this.adapters.filter((a) => a.name !== name);
    return this.adapters.length < initial;
  }

  public find(urlOrName: string, headers?: HeaderSource, providerHint?: string): ProviderAdapter {
    let hostname = '';
    try {
      hostname = new URL(urlOrName).hostname.toLowerCase();
    } catch {
      hostname = urlOrName.toLowerCase();
    }

    const context: ProviderContext = { url: urlOrName, hostname, headers, providerHint };
    for (const adapter of this.adapters) {
      if (adapter.matches(context)) {
        return adapter;
      }
    }

    return genericAdapter;
  }
}

// Initialized AFTER all adapter constants are created
export const defaultRegistry = new ProviderRegistry([
  openAIAdapter,
  anthropicAdapter,
  groqAdapter,
  azureAdapter,
  geminiAdapter,
]);

export function registerProvider(adapter: ProviderAdapter): void {
  defaultRegistry.register(adapter);
}

export function findProviderAdapter(urlOrName: string, headers?: HeaderSource, providerHint?: string): ProviderAdapter {
  return defaultRegistry.find(urlOrName, headers, providerHint);
}