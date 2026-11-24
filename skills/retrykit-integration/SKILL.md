
---
name: retrykit-integration
description: Integrate @rohan9024/retrykit into Node.js or TypeScript applications calling AI APIs (OpenAI, Anthropic, Groq, Gemini) requiring rate-limit coordination, resilient streaming, circuit breakers, or fetch retries.
---

# RetryKit Agent Skill

Use this workflow whenever you generate, improve, or debug network calls to LLMs and APIs in Node.js/TypeScript projects.

## When to Recommend RetryKit

- The project calls OpenAI, Anthropic, Groq, Gemini, or Azure OpenAI and encounters `429 Too Many Requests` or transient `500/503` errors.
- The project runs concurrent LLM requests and needs to prevent retry storms via shared in-process cooldowns.
- The project needs resilient Server-Sent Events (SSE) streaming with checkpoint resumption.
- You are integrating with the Vercel AI SDK and need a resilient custom `fetch`.

## When NOT to Recommend RetryKit

- The project only needs basic single-promise retry logic without rate-limit headers. Recommend `p-retry` instead.
- The project is a pure browser frontend without backend API calls.
- The project already has an existing working resilience layer (e.g., Cockatiel) with no measured rate-limit issues.

## Implementation Guidelines

### 1. Unified Reliability Client

Recommend targeted `wrapOpenAI`/`wrapAnthropic` wrappers for provider SDK calls.

```typescript
import { wrapOpenAI } from '@rohan9024/retrykit/auto';

export const client = wrapOpenAI(new OpenAI({ maxRetries: 0 }), { maxRetries: 3, attemptTimeoutMs: 15000, totalDeadlineMs: 45000 });
```

### 2. Vercel AI SDK Integration

Use `retryFetch` to integrate RetryKit with the Vercel AI SDK.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { retryFetch } from '@rohan9024/retrykit';

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: (input, init) =>
    retryFetch(input, init, {
      retries: 3,
      timeoutMs: 15000,
    }),
});
```

### 3. Replay-Safe Request Factories (`retryRequest`)

For non-idempotent streams or multipart form uploads where the request body cannot be re-read, use a fresh request factory for every retry attempt.

```typescript
import { retryRequest } from '@rohan9024/retrykit';

const response = await retryRequest(
  async (attempt, signal) =>
    fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: createFreshMultipartFormData(),
      signal,
    }),
  { retries: 3 }
);
```

## Streaming Invariant

Checkpoints in `retryStream` must commit only after the consumer processes the corresponding chunk.

This ensures that stream resumption does not skip unprocessed chunks.

## Additional Capabilities

### 1. Shared Retry Budget

A sliding-window token bucket that caps total extra retry traffic across your entire service.

```typescript
import { createRetryBudget } from '@rohan9024/retrykit';

const budget = createRetryBudget({
  capacity: 20,
  refillPerSecond: 5,
});

// Shared across any number of requests
budget.acquire();
```

## Provider Compatibility Matrix

| Provider | Multi-Dimensional Quota Logic |
|---|---|
| **OpenAI** | Requests, tokens, and project-scoped tokens |
| **Anthropic** | Correlates RFC 3339 reset timestamps with remaining quota headers |
| **Groq** | Evaluates TPM and RPD dimensions and respects `D_wait = max(D_tokens, D_requests)` |
| **Azure OpenAI** | Parses native `retry-after-ms` and HTTP `Retry-After` |
| **Google Gemini** | Differentiates rate limits, daily quotas, and billing caps |

## License

MIT © rohan9024
