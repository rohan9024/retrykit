
# @rohan9024/retrykit ⚡

> Provider-aware retries, rate-limit intelligence, and request resilience for Node.js and TypeScript AI applications.

[![npm version](https://img.shields.io/npm/v/@rohan9024/retrykit.svg)](https://www.npmjs.com/package/@rohan9024/retrykit)
[![CI](https://github.com/rohan9024/retrykit/actions/workflows/ci.yml/badge.svg)](https://github.com/rohan9024/retrykit/actions)
[![License](https://img.shields.io/npm/l/@rohan9024/retrykit.svg)](https://github.com/rohan9024/retrykit)

Generic retry libraries like `p-retry` and `ky` are not designed to understand multi-dimensional LLM quotas. This can lead to retry storms, unnecessary API requests, and duplicate token generation.

**RetryKit** provides an intelligent provider adapter registry, in-process rate-limit coordination, checkpoint-driven stream resumption, and atomic circuit breaking — with zero external runtime dependencies.

---

## 📦 Installation

```bash
npm install @rohan9024/retrykit
```

## 🚀 Key Features & Usage

### 1. Vercel AI SDK Integration

Integrate RetryKit directly into the Vercel AI SDK transport layer to handle rate limits and transient failures automatically.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { retryFetch } from '@rohan9024/retrykit';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: (input, init) =>
    retryFetch(input, init, {
      retries: 3,
      timeoutMs: 15000,
      maxDelayMs: 30000,
      retrySafety: 'all',
    }),
});
```

### 2. Provider Rate-Limit Coordinator

**Eliminate retry storms.**

Coordinate concurrent requests in-process. When one request hits a rate limit, other queued requests pause instead of continuously hammering the provider.

```typescript
import {
  getProviderCoordinator,
  retryFetch,
} from '@rohan9024/retrykit';

const coordinator = getProviderCoordinator('openai', 10);

const response = await coordinator.schedule(() =>
  retryFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    },
    {
      retries: 3,
      maxElapsedTimeMs: 45000,
    }
  )
);
```

### 3. Checkpoint-Driven Resilient Streaming

**Prevent duplicate generation.**

Use cursor-tracked checkpoints to resume interrupted streams from the last acknowledged position.

```typescript
import { retryStream } from '@rohan9024/retrykit';

for await (const chunk of retryStream({
  createStream: async (checkpoint, attempt, signal) =>
    fetchLLMStream({ cursor: checkpoint, signal }),

  getCheckpoint: (chunk) => chunk.id,

  retries: 3,
})) {
  process.stdout.write(chunk.text);
}
```

### 4. Replay-Safe Request Factories

Use `retryRequest` for non-idempotent operations and requests with bodies that cannot be safely reused, such as multipart form uploads.

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
  {
    retries: 3,
  }
);
```

### 5. Atomic Circuit Breaker

Protect your application during provider outages.

RetryKit's circuit breaker transitions into an OPEN state after repeated failures and enforces strict single-probe execution during HALF_OPEN recovery.

```typescript
import { CircuitBreaker } from '@rohan9024/retrykit';

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 1,
});

const result = await breaker.execute(() => callUnstableAPI());
```

---

## 🧠 Provider Compatibility Matrix

| Provider | Rate-Limit Intelligence |
|---|---|
| **OpenAI** | Evaluates requests, tokens, and project-scoped token limits. |
| **Anthropic** | Correlates RFC 3339 reset timestamps with remaining quota headers. |
| **Groq** | Evaluates TPM and RPD limits and respects the longest required wait time. |
| **Azure OpenAI** | Parses native `retry-after-ms` and HTTP `Retry-After` headers. |
| **Google Gemini** | Classifies `RESOURCE_EXHAUSTED` status codes and quota errors. |
| **DeepSeek** | Handles transient concurrency failures through adaptive jitter backoff. |

For multi-dimensional quotas, RetryKit calculates the required waiting period using:

\[
D_{\text{wait}} = \max(D_{\text{tokens}}, D_{\text{requests}})
\]

This ensures that a request respects the longest applicable rate-limit delay.

---

## ⚙️ Options Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `retries` | `number` | `3` | Maximum retry attempts. |
| `baseDelayMs` | `number` | `500` | Starting backoff delay in milliseconds. |
| `maxDelayMs` | `number` | `30000` | Maximum backoff delay. |
| `maxElapsedTimeMs` | `number` | `undefined` | Hard deadline for the entire operation. |
| `timeoutMs` | `number` | `undefined` | Per-attempt response acquisition timeout. |
| `retryBudget` | `RetryBudget` | `undefined` | Caps additional retry traffic within a sliding window. |
| `retrySafety` | `'safe-methods-only' \| 'all'` | `'all'` | Controls automatic retries on non-idempotent HTTP methods. |
| `exceedsMaxDelayBehavior` | `'throw' \| 'clamp'` | `'throw'` | Throws `RateLimitExceededError` instead of retrying earlier than the required delay. |

---

## 📄 License

MIT © [rohan9024](https://github.com/rohan9024)
