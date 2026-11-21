import { retry } from './retry.js';

export interface RetryMiddlewareOptions { maxRetries?: number; timeoutMs?: number; backoff?: any; signal?: AbortSignal; }
export interface LanguageModelMiddleware {
  transformParams: (input: { params: any }) => Promise<{ params: any }>;
  wrapGenerate: (input: { doGenerate: () => Promise<any>; params: any }) => Promise<any>;
  wrapStream: (input: { doStream: () => Promise<any>; params: any }) => Promise<any>;
}

/** Structural Vercel AI SDK middleware; imports no AI SDK runtime package. */
export function retryMiddleware(options: RetryMiddlewareOptions = {}): LanguageModelMiddleware {
  return {
    transformParams: async ({ params }) => ({
      params: params && typeof params === 'object' && Number(params.maxRetries) > 0
        ? { ...params, maxRetries: 0 }
        : params,
    }),
    wrapGenerate: async ({ doGenerate }) => retry(() => doGenerate(), options as any),
    wrapStream: async ({ doStream }) => retry(() => doStream(), options as any),
  };
}
