export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 500 */
  baseDelayMs?: number;
  /** Maximum backoff ceiling delay in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504] */
  retryOnStatus?: number[];
  /** Optional callback fired on every retry attempt before sleep */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal for immediate cancellation */
  signal?: AbortSignal;
}

export type HeaderSource = Headers | Record<string, string | string[] | undefined> | [string, string][] | undefined;