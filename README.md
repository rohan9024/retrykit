
# @rohan9024/retrykit ⚡

> A zero-dependency, header-aware retry engine and circuit breaker built for reliable LLM API integrations.

[![npm version](https://img.shields.io/npm/v/@rohan9024/retrykit.svg)](https://www.npmjs.com/package/@rohan9024/retrykit)
[![license](https://img.shields.io/npm/l/@rohan9024/retrykit.svg)](https://github.com/rohan9024/retrykit)
[![bundle size](https://img.shields.io/bundlephobia/min/@rohan9024/retrykit)](https://bundlephobia.com/package/@rohan9024/retrykit)

**RetryKit** helps developers build resilient applications powered by LLM APIs such as OpenAI, Anthropic, DeepSeek, Groq, and Mistral.

Unlike basic retry libraries such as `p-retry` or `tenacity`, RetryKit understands provider-specific rate-limit headers and uses that information to schedule smarter retries.

### Why RetryKit?

- **Header-aware retries:** Parses provider-specific rate-limit reset headers.
- **Exponential backoff with jitter:** Prevents synchronized retry storms.
- **SSE stream resilience:** Handles mid-stream connection interruptions.
- **Circuit breaker:** Prevents cascading failures during provider outages.
- **Timeout protection:** Supports per-attempt request timeouts.
- **Zero dependencies:** Lightweight and dependency-free.

---

## 📦 Installation

```bash
npm install @rohan9024/retrykit
```

---

## 🚀 Quick Start

### 1. Drop-in Fetch Replacement (`retryFetch`)

Use `retryFetch` just like standard `fetch`, with automatic retries and rate-limit awareness.

```typescript
import { retryFetch } from '@rohan9024/retrykit';

const response = await retryFetch(
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
        { role: 'user', content: 'Say hello!' }
      ],
    }),
  },
  {
    retries: 4,
    timeoutMs: 15000,
    onRetry: (error, attempt, delayMs) => {
      console.warn(
        `Retry #${attempt}: Waiting ${delayMs}ms...`
      );
    },
  }
);

const data = await response.json();
```

### 2. Wrap Official SDKs (`retry`)

Use RetryKit with existing SDKs such as OpenAI, Anthropic, Mistral, or Google.

```typescript
import OpenAI from 'openai';
import { retry } from '@rohan9024/retrykit';

const openai = new OpenAI();

const completion = await retry(
  () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: 'Write a poem about resilience',
        },
      ],
    }),
  {
    retries: 3,
    baseDelayMs: 500,
  }
);
```

### 3. Resilient Token Streaming (`retryStream`)

LLM streaming connections can fail midway through generation. `retryStream` helps recover from interrupted streams.

```typescript
import { retryStream } from '@rohan9024/retrykit';

async function* tokenGenerator() {
  const stream = await fetchLLMStream();

  for await (const chunk of stream) {
    yield chunk;
  }
}

for await (const chunk of retryStream(() => tokenGenerator())) {
  process.stdout.write(chunk);
}
```

### 4. Circuit Breaker

Protect your application from cascading failures and unnecessary requests when an AI provider experiences an outage.

```typescript
import { CircuitBreaker } from '@rohan9024/retrykit';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,

  onStateChange: (from, to) => {
    console.log(`Circuit changed: ${from} -> ${to}`);
  },
});

// Fails fast when the circuit is open
const result = await breaker.execute(() => callUnstableAPI());
```

---

## 🧠 Supported Provider Headers

RetryKit automatically extracts retry timing information from commonly used API rate-limit headers.

| Provider | Supported Headers |
|---|---|
| OpenAI | `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, `retry-after` |
| Anthropic | `anthropic-ratelimit-requests-reset`, `anthropic-ratelimit-tokens-reset`, `retry-after` |
| Groq / DeepSeek | `x-ratelimit-reset-total`, `retry-after-ms`, `retry-after` |
| Standard HTTP | `Retry-After` (integer seconds or RFC 1123 HTTP dates) |

---

## ⚙️ Configuration Options

RetryKit provides configurable retry behavior.

| Option | Type | Default | Description |
|---|---|---|---|
| `retries` | `number` | `3` | Maximum retry attempts before failing |
| `baseDelayMs` | `number` | `500` | Initial backoff delay in milliseconds |
| `maxDelayMs` | `number` | `30000` | Maximum backoff delay |
| `timeoutMs` | `number` | `undefined` | Per-attempt timeout in milliseconds |
| `retryOnStatus` | `number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger retries |
| `shouldRetry` | `(err, attempt) => boolean` | `undefined` | Custom retry decision logic |
| `onRetry` | `(err, attempt, delay) => void` | `undefined` | Callback executed before each retry |
| `signal` | `AbortSignal` | `undefined` | Abort signal for immediate cancellation |

---

## 🛡️ Designed For

- LLM-powered applications
- AI agents and autonomous workflows
- RAG pipelines
- High-volume API integrations
- Streaming chat applications
- Production AI infrastructure

---

## 📄 License

MIT © [rohan9024](https://github.com/rohan9024)

---

<p align="center">
  Built for developers who want their AI applications to be resilient. ⚡
</p>
