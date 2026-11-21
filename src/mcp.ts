export interface McpResult { isError?: boolean; [key: string]: unknown; }
export interface McpRetryOptions {
  maxRetries?: number;
  method?: string;
  toolName?: string;
  idempotentTools?: string[];
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const SAFE_METHODS = new Set(['resources/read', 'resources/list', 'prompts/get', 'completion/complete']);

function isIdempotent(options: McpRetryOptions): boolean {
  if (options.method && SAFE_METHODS.has(options.method)) return true;
  return Boolean(options.toolName && options.idempotentTools?.some((name) => name === options.toolName));
}

/** Wrap an idempotent MCP operation; callers decide which methods are safe to retry. */
export async function withMcpRetry<T>(operation: () => Promise<T>, options: McpRetryOptions = {}): Promise<T> {
  const canRetry = isIdempotent(options);
  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.maxRetries ?? 2); attempt++) {
    try {
      const result = await operation();
      if (canRetry && result && typeof result === 'object' && (result as McpResult).isError === true) {
        lastError = new Error('MCP operation returned isError: true');
        if (attempt < (options.maxRetries ?? 2)) continue;
        throw lastError;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (!canRetry || (options.shouldRetry && !options.shouldRetry(error, attempt))) throw error;
    }
  }
  throw lastError;
}
