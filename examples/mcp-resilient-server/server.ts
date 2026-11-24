import { withMcpRetry } from '@rohan9024/retrykit/mcp';
import { createOTelObserver } from '@rohan9024/retrykit/otel';

const observer = createOTelObserver({ startSpan: () => ({ end() {} }) });
export async function callIdempotentTool(name: string, args: unknown, idempotencyKey: string) {
  observer.startSpan?.('mcp.tool', { name });
  return withMcpRetry(() => invokeTool(name, args, idempotencyKey), { method: 'resources/read', maxRetries: 2 });
}
async function invokeTool(name: string, args: unknown, idempotencyKey: string) { return { name, args, idempotencyKey, isError: false }; }
