export interface RetrySpanEvent { name: string; attributes?: Record<string, string | number | boolean>; }
export interface RetryObserver { startSpan?: (name: string, attributes?: Record<string, unknown>) => { end?: () => void; recordException?: (error: unknown) => void; setAttribute?: (key: string, value: unknown) => void }; }

function safeAttributes(attributes: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attributes).filter(([key, value]) => !/key|token|secret|authorization|prompt|content/i.test(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')));
}

export function createOTelObserver(tracer: RetryObserver, options: { includePrompts?: boolean } = {}): RetryObserver {
  return {
    startSpan(name, attributes) {
      const clean = options.includePrompts ? attributes : safeAttributes(attributes);
      return tracer.startSpan?.(name, clean) ?? {};
    },
  };
}
