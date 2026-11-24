export function isReplayableBody(body: unknown): boolean {
  return body === undefined || typeof body === 'string' || body instanceof Uint8Array || body instanceof URLSearchParams || (typeof body === 'object' && body !== null && typeof (body as any).getReader !== 'function' && typeof (body as any)[Symbol.asyncIterator] !== 'function');
}

export function isRetrySafeMethod(method: string, options: { idempotencyKey?: string; allowIdempotentMethods?: boolean; allowUnsafePostRetry?: boolean; unsafeReplayApproved?: boolean } = {}): boolean {
  const normalized = method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(normalized)) return true;
  if (['PUT', 'DELETE'].includes(normalized)) return Boolean(options.allowIdempotentMethods || options.idempotencyKey);
  return Boolean(options.idempotencyKey || options.allowUnsafePostRetry || options.unsafeReplayApproved);
}
