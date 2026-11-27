export type FailureCategory =
  | 'rate_limit' | 'billing_exhausted' | 'auth_error' | 'invalid_request'
  | 'overloaded' | 'server_error' | 'timeout' | 'network_transient'
  | 'user_aborted' | 'unknown';

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'deepseek' | 'generic';

export interface ErrorClassification {
  category: FailureCategory;
  provider: AIProvider;
  status?: number;
  code?: string;
  retrySameKey: boolean;
  allowKeyRotation: boolean;
  countsTowardCircuit: boolean;
  retryAfterMs?: number;
  reason: string;
}

const BILLING = new Set(['insufficient_quota', 'credit_balance_exhausted', 'credit_balance_too_low', 'billing_hard_limit_reached', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'enforced_spend_limit_reached', 'quota_exceeded_billing']);
const AUTH = new Set(['invalid_api_key', 'authentication_error', 'permission_error', 'invalid_auth_token', 'account_deactivated']);
const NETWORK = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

function header(headers: Headers | Record<string, string | string[] | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? (headers as Record<string, string | string[] | undefined>)[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

function duration(raw: string): number | undefined {
  const value = raw.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
  if (!parts.length || parts.map((m) => m[0]).join('') !== value) return undefined;
  return Math.ceil(parts.reduce((sum, m) => sum + Number(m[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 } as Record<string, number>)[m[2]], 0));
}

export function parseRetryAfterMs(headers: Headers | Record<string, string | string[] | undefined> | undefined, nowMs = Date.now()): number | undefined {
  const ms = header(headers, 'retry-after-ms');
  if (ms !== undefined && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const retryAfter = header(headers, 'retry-after');
  if (retryAfter !== undefined) {
    const numeric = Number(retryAfter.trim());
    if (Number.isFinite(numeric)) return Math.max(0, Math.ceil(numeric * 1000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  }
  for (const name of ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens', 'anthropic-ratelimit-unified-reset-after']) {
    const value = header(headers, name);
    if (value) {
      const parsed = duration(value);
      if (parsed !== undefined) return parsed;
    }
  }
  for (const name of ['anthropic-ratelimit-requests-reset', 'anthropic-ratelimit-tokens-reset', 'anthropic-ratelimit-input-tokens-reset']) {
    const value = header(headers, name);
    if (value) { const date = Date.parse(value); if (Number.isFinite(date)) return Math.max(0, date - nowMs); }
  }
  return undefined;
}

function shape(error: unknown): { status?: number; code?: string; type?: string; message: string; headers?: Headers | Record<string, string | string[] | undefined>; name?: string; shouldRetry?: boolean } {
  if (error instanceof Response) return { status: error.status, message: error.statusText || `HTTP ${error.status}`, headers: error.headers, name: 'Response' };
  if (!error || typeof error !== 'object') return { message: String(error ?? 'Unknown error') };
  const value = error as Record<string, any>;
  const nested = value.error && typeof value.error === 'object' ? value.error : {};
  const response = value.response && typeof value.response === 'object' ? value.response : {};
  const details = nested.details && typeof nested.details === 'object' ? nested.details : {};
  const retryHeader = header(value.headers ?? response.headers, 'x-should-retry');
  return {
    status: value.status ?? value.statusCode ?? response.status,
    code: nested.code ?? details.error_code ?? value.code,
    type: nested.type ?? value.type,
    message: nested.message ?? value.message ?? 'Unknown error',
    headers: value.headers ?? response.headers,
    name: value.name,
    shouldRetry: retryHeader === undefined ? undefined : retryHeader.toLowerCase() === 'true',
  };
}

export function classifyFailure(error: unknown, options: { provider?: AIProvider; nowMs?: number; signalAborted?: boolean } = {}): ErrorClassification {
  const value = shape(error);
  const code = String(value.code ?? value.type ?? '').toLowerCase();
  const message = String(value.message).toLowerCase();
  const status = typeof value.status === 'number' ? value.status : undefined;
  const provider = options.provider ?? 'generic';
  const retryAfterMs = parseRetryAfterMs(value.headers, options.nowMs);
  if (options.signalAborted || (value.name === 'AbortError' && !message.includes('timeout'))) return { category: 'user_aborted', provider, status, code: value.code, retrySameKey: false, allowKeyRotation: false, countsTowardCircuit: false, reason: 'Request aborted by caller.' };
  if (value.name === 'TimeoutError' || message.includes('timeout') || message.includes('timed out')) return { category: 'timeout', provider, status, code: value.code, retrySameKey: true, allowKeyRotation: false, countsTowardCircuit: true, retryAfterMs, reason: 'Transient timeout.' };
  if (status === 402 || BILLING.has(code) || message.includes('insufficient_quota') || message.includes('credit balance')) return { category: 'billing_exhausted', provider, status, code: value.code, retrySameKey: false, allowKeyRotation: true, countsTowardCircuit: false, retryAfterMs, reason: 'Billing or quota exhaustion; do not retry the same credential.' };
  if (status === 401 || status === 403 || AUTH.has(code)) return { category: 'auth_error', provider, status, code: value.code, retrySameKey: false, allowKeyRotation: false, countsTowardCircuit: false, reason: 'Authentication or permission failure.' };
  if (status === 400 || status === 413 || status === 422) return { category: 'invalid_request', provider, status, code: value.code, retrySameKey: false, allowKeyRotation: false, countsTowardCircuit: false, reason: 'Malformed or rejected request.' };
  if (status === 429 || code.includes('rate_limit') || code === 'rate_limit_exceeded') return { category: 'rate_limit', provider, status, code: value.code, retrySameKey: value.shouldRetry !== false, allowKeyRotation: value.shouldRetry !== false, countsTowardCircuit: true, retryAfterMs, reason: value.shouldRetry === false ? 'Provider explicitly marked the request as non-retryable.' : 'Provider rate limit.' };
  if (status === 529 || code === 'overloaded_error' || message.includes('overloaded')) return { category: 'overloaded', provider, status, code: value.code, retrySameKey: value.shouldRetry !== false, allowKeyRotation: false, countsTowardCircuit: true, retryAfterMs, reason: value.shouldRetry === false ? 'Provider explicitly marked the request as non-retryable.' : 'Provider overloaded.' };
  if ((status !== undefined && status >= 500 && status <= 599) || NETWORK.has(String(value.code)) || /network|reset|connection refused|temporar/.test(message)) return { category: status ? 'server_error' : 'network_transient', provider, status, code: value.code, retrySameKey: true, allowKeyRotation: false, countsTowardCircuit: true, retryAfterMs, reason: 'Transient upstream or network failure.' };
  return { category: 'unknown', provider, status, code: value.code, retrySameKey: false, allowKeyRotation: false, countsTowardCircuit: false, retryAfterMs, reason: 'Unclassified failure; retry is disabled by default.' };
}
