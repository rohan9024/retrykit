import { retry } from './retry.js';
import { extractRateLimitInfo } from './providers.js';
import { RetryOptions } from './types.js';

const AI_DOMAINS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.deepseek.com',
  'api.mistral.ai',
];

export function patchGlobalFetch(defaultOptions: RetryOptions<Response> = {}): void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function retryKitFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    const isTargetDomain = AI_DOMAINS.some((domain) => urlString.includes(domain));

    if (!isTargetDomain) {
      return originalFetch(input, init);
    }

    return retry(async () => {
      const response = await originalFetch(input, init);

      if (response.ok) {
        return response;
      }

      const status = response.status;
      if (status === 429 || (status >= 500 && status <= 504)) {
        let bodyText = '';
        try {
          bodyText = await response.clone().text();
        } catch {
          // ignore stream clone errors
        }

        const errObj = {
          status,
          statusText: response.statusText,
          headers: response.headers,
          message: bodyText || response.statusText,
        };

        const rateInfo = extractRateLimitInfo(errObj);
        if (rateInfo.isFatal) {
          return response;
        }

        throw errObj;
      }

      return response;
    }, defaultOptions);
  };
}