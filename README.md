
# @rohan9024/retrykit ⚡

> The provider-aware network reliability layer for Node.js and TypeScript AI applications.

[![npm version](https://img.shields.io/npm/v/@rohan9024/retrykit.svg)](https://www.npmjs.com/package/@rohan9024/retrykit)
[![CI](https://github.com/rohan9024/retrykit/actions/workflows/ci.yml/badge.svg)](https://github.com/rohan9024/retrykit/actions)
[![License](https://img.shields.io/npm/l/@rohan9024/retrykit.svg)](https://github.com/rohan9024/retrykit)

Generic retry libraries (`p-retry`, `ky`) are blind to multi-dimensional LLM quotas, triggering retry amplification storms, deadlocks, and duplicate token generation.

`retrykit` provides an intelligent provider adapter registry, in-process rate-limit coordination, checkpoint-driven stream resumption, and atomic circuit breaking with **zero runtime dependencies**.

---

## 📦 Installation

```bash
npm install @rohan9024/retrykit
```

---

## 🚀 Quickstart: Unified Reliability Client

`createRetryClient` coordinates admission queues, provider cooldowns, circuit breaking, and retry budgets across your entire service.

Concurrency slots are acquired strictly for network transit and **released immediately before backoff sleep**, preventing throttled requests from blocking concurrency capacity.

```typescript
import { createRetryClient } from '@rohan9024/retrykit';

export const client = createRetryClient({
  provider: 'openai', // 'anthropic' | 'groq' | 'azure-openai' | 'gemini'
  concurrency: 10,

  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
  },

  budget: {
    capacity: 20,
    refillPerSecond: 5,
  },

  retry: {
    retries: 3,
    timeoutMs: 15000,
    maxElapsedTimeMs: 45000,
    retrySafety: 'all',
  },
});

// Drop-in fetch replacement with automatic rate-limit coordination
const response = await client.fetch(
  'https://api.openai.com/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: 'Explain Retrieval-Augmented Generation',
        },
      ],
    }),
  }
);

const data = await response.json();
```

---

## 💻 Standalone Primitives

### 1. Vercel AI SDK Integration

Plug `retryFetch` directly into the Vercel AI SDK transport layer to handle rate limits and transient socket drops automatically.

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { retryFetch } from '@rohan9024/retrykit';

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: (input, init) =>
    retryFetch(input, init, {
      retries: 3,
      timeoutMs: 15000,
      retrySafety: 'all',
    }),
});
```

---

### 2. Checkpoint-Driven Resilient Streaming (`retryStream`)

Avoid duplicate tokens when an SSE connection drops mid-generation by tracking cursor acknowledgements.

```typescript
import { retryStream } from '@rohan9024/retrykit';

for await (const chunk of retryStream({
  createStream: async (checkpoint, attempt, signal) =>
    fetchLLMStream({ cursor: checkpoint, signal }),

  getCheckpoint: (chunk) => chunk.id, // Checkpoint commits only after consumer processes the chunk

  retries: 3,
  timeoutMs: 10000,
})) {
  process.stdout.write(chunk.text);
}
```

> **Safety Invariant:** If a stream drops mid-sentence without a cursor checkpoint, RetryKit throws `StreamDuplicatePreventionError` rather than blindly restarting and generating duplicated tokens.

---

### 3. Replay-Safe Request Factories (`retryRequest`)

For non-idempotent streams, audio uploads, or multipart form requests where the body cannot be re-read.

```typescript
import { retryRequest } from '@rohan9024/retrykit';

const response = await retryRequest(
  async (attempt, signal) =>
    fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: createFreshAudioFormData(), // Fresh stream created per attempt
      signal,
    }),
  { retries: 3 }
);
```

---

### 4. Shared Token-Bucket Retry Budget

A cross-operation token bucket that caps total extra retry traffic across your entire service to prevent retry storms.

```typescript
import { createRetryBudget } from '@rohan9024/retrykit';

const budget = createRetryBudget({
  capacity: 25,
  refillPerSecond: 5,
});

// Shared across multiple clients or fetch calls
budget.acquire();
```

---

### 5. Wrapping Official AI SDKs (`retry`)

Wrap official OpenAI, Anthropic, or Gemini SDK calls.

Disable nested SDK retries (`maxRetries: 0`) to prevent retry multiplication.

```typescript
import OpenAI from 'openai';
import { retry } from '@rohan9024/retrykit';

const openai = new OpenAI({
  maxRetries: 0,
});

const completion = await retry((attempt, signal) =>
  openai.chat.completions.create(
    {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello!' }],
    },
    { signal }
  )
);
```

---

## 🧠 Provider Compatibility Matrix

RetryKit uses strict domain-boundary matching and multi-dimensional quota tracking:

\[
D_{\text{wait}} = \max(D_{\text{tokens}}, D_{\text{requests}})
\]

| Provider | Multi-Dimensional Quota & Error Handling |
|---|---|
| **OpenAI** | Evaluates requests, tokens, and project-scoped token resets. |
| **Anthropic** | Correlates RFC 3339 timestamps with remaining quota dimensions. |
| **Groq** | Evaluates TPM and RPD dimensions and respects the maximum token/request wait time. |
| **Azure OpenAI** | Parses native `retry-after-ms` and standard RFC `Retry-After`. |
| **Google Gemini** | Differentiates temporary rate limits, daily quota limits, and billing caps. |

---

## ⚙️ Options Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `retries` | `number` | `3` | Maximum retry attempts. |
| `baseDelayMs` | `number` | `500` | Starting backoff delay in milliseconds. |
| `maxDelayMs` | `number` | `30000` | Backoff ceiling cap in milliseconds. |
| `maxElapsedTimeMs` | `number` | `undefined` | Hard deadline for the entire operation (queue + backoff + network). |
| `timeoutMs` | `number` | `undefined` | Per-attempt response acquisition timeout in milliseconds. |
| `retrySafety` | `'safe-methods-only' \| 'idempotent-methods-only' \| 'all'` | `'all'` | Controls automatic retries on non-idempotent methods. |
| `exceedsMaxDelayBehavior` | `'throw' \| 'defer' \| 'clamp'` | `'throw'` | Action when server delay exceeds `maxDelayMs`. |
| `retryOnStatus` | `number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry. |
| `shouldRetry` | `(err, attempt) => boolean` | `undefined` | Custom predicate for retry decisions. |
| `onRetry` | `(err, attempt, delay) => void` | `undefined` | Callback fired before each retry sleep. |
| `signal` | `AbortSignal` | `undefined` | Cooperative cancellation controller. |

---

## 📄 License

MIT © [rohan9024](https://github.com/rohan9024)
