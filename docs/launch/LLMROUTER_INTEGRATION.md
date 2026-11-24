# llmrouter integration plan

The sibling repository at `D:\llmrouter\llmrouter` is `@rohan9024/llmrouter` v2.0.1. It currently has no RetryKit dependency or source references.

Recommended migration plan:

1. Add `@rohan9024/retrykit` only at the adapter boundary if the router delegates provider retry policy.
2. Set provider SDK retries to zero and use `@rohan9024/retrykit/auto` for nested interception and key rotation.
3. Apply RetryKit classification and rate-limit parsing before provider selection, without holding router slots during backoff.
4. Use `retryStream` only with a real `getCheckpoint` implementation and keep circuit-breaker ownership explicit.
5. Add integration tests for provider failover, quota errors, HTTP 429/529, stream recovery, and idempotency.

No files outside the RetryKit repository were modified.
