import { retry, RetryKit } from './retry.js';
import { RetryOptions } from './types.js';

export interface AutoOptions<T = unknown> extends Omit<RetryOptions<T>, 'provider'> {
  onWarning?: (message: string) => void;
  env?: Record<string, string | undefined>;
  keys?: string[];
  keyField?: string;
  provider?: 'openai' | 'anthropic' | 'gemini' | string;
  allowedMethods?: string[];
}

const KEY_ENV_NAMES = ['OPENAI_API_KEYS', 'ANTHROPIC_API_KEYS', 'GEMINI_API_KEYS'];

function collectKeys(options: AutoOptions): string[] {
  if (options.keys?.length) return options.keys.filter(Boolean);
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  const names = options.provider
    ? KEY_ENV_NAMES.filter((name) => name.startsWith(options.provider!.toUpperCase()))
    : KEY_ENV_NAMES;
  const values = names.flatMap((name) => {
    const numbered = Object.entries(env)
      .filter(([key]) => new RegExp(`^${name.replace(/S$/, '')}_\\d+$`).test(key))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
    return [env[name], ...numbered.map(([, value]) => value)].filter(Boolean) as string[];
  });
  return [...new Set(values.flatMap((value) => value.split(',').map((key) => key.trim()).filter(Boolean)))];
}

function neutralize(value: any): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const copy = { ...value };
  if ('maxRetries' in copy && Number(copy.maxRetries) > 0) copy.maxRetries = 0;
  return copy;
}

interface KeyState { keys: string[]; next: number; }

function makeCallArgs(args: any[], keyState: KeyState | undefined, options: AutoOptions): any[] {
  const next = args.map(neutralize);
  if (keyState) {
    const key = keyState.keys[keyState.next % keyState.keys.length];
    keyState.next++;
    const provider = (options.provider ?? 'openai').toLowerCase();
    const headerName = provider.includes('anthropic') ? 'x-api-key' : provider.includes('gemini') ? 'x-goog-api-key' : 'authorization';
    const headerValue = headerName === 'authorization' ? `Bearer ${key}` : key;
    const requestOptions = next[1] && typeof next[1] === 'object' ? { ...next[1] } : {};
    const headers = { ...(requestOptions.headers ?? {}) };
    if (headers[headerName] === undefined && headers[headerName.toLowerCase()] === undefined) headers[headerName] = headerValue;
    requestOptions.headers = headers;
    if (Number(requestOptions.maxRetries) > 0) requestOptions.maxRetries = 0;
    next[1] = requestOptions;
    if (options.keyField && next[0] && typeof next[0] === 'object' && next[0][options.keyField] === undefined) {
      next[0] = { ...next[0], [options.keyField]: key };
    }
  }
  return next;
}

function proxyResource(value: any, options: AutoOptions, keyState?: KeyState, seen = new WeakMap<object, any>(), path: string[] = []): any {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (seen.has(value)) return seen.get(value);
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      const child = Reflect.get(target, property, receiver);
      const childPath = [...path, String(property)];
      if (typeof child === 'function') {
        const allowed = !options.allowedMethods || options.allowedMethods.includes(childPath.join('.'));
        if (!allowed) return child.bind(target);
        return (...args: any[]) => {
          const { provider: _provider, ...retryOptions } = options;
          return retry(() => child.apply(target, makeCallArgs(args, keyState, options)), { ...retryOptions, maxRetries: options.maxRetries ?? 3 });
        };
      }
      return proxyResource(child, options, keyState, seen, childPath);
    },
  });
  seen.set(value, proxy);
  return proxy;
}

/** Wraps a provider client, including nested resources such as chat.completions.create. */
export function wrapAI<T>(client: T, options: AutoOptions = {}): T {
  const keys = collectKeys(options);
  return proxyResource(client, options, keys.length ? { keys, next: 0 } : undefined) as T;
}

const OPENAI_METHODS = ['chat.completions.create', 'responses.create', 'embeddings.create', 'images.generate', 'audio.transcriptions.create', 'audio.speech.create'];
const ANTHROPIC_METHODS = ['messages.create', 'messages.stream'];

export function wrapOpenAI<T>(client: T, options: AutoOptions = {}): T {
  return wrapAI(client, { ...options, provider: 'openai', allowedMethods: options.allowedMethods ?? OPENAI_METHODS });
}

export function wrapAnthropic<T>(client: T, options: AutoOptions = {}): T {
  return wrapAI(client, { ...options, provider: 'anthropic', allowedMethods: options.allowedMethods ?? ANTHROPIC_METHODS });
}

/** Create a fetch function that applies bounded retries to requests. */
export function createAutoFetch(options: AutoOptions = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { retryFetch } = await import('./fetch.js');
    return retryFetch(input, init, options as any);
  }) as typeof fetch;
}

export function createRetryKit<T = unknown>(): RetryKit<T> {
  return RetryKit.create<T>();
}

export function discoverApiKeys(env: Record<string, string | undefined> = {}): string[] {
  return collectKeys({ env });
}
