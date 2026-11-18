
# RetryKit

**A zero-dependency resilience toolkit for AI API calls.**

RetryKit makes AI API calls more reliable with intelligent retries, rate-limit-aware handling, API key rotation, fallback chains, budget protection, request deduplication, and streaming protection.

Built for applications using OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral, and other LLM providers.

---

## Why RetryKit?

AI APIs can fail for many reasons:

- Rate limits (`429`)
- Temporary server errors (`5xx`)
- Network failures
- API key limits
- Streaming responses getting stuck
- Repeated duplicate requests
- Unexpected token or cost consumption

RetryKit helps handle these problems without requiring developers to build their own retry infrastructure.

---

## Features

- 🔄 **Intelligent Retries** – Automatically retry failed requests.
- ⚡ **Exponential Backoff** – Reduce unnecessary requests during failures.
- 🎲 **Jitter Support** – Prevent synchronized retry storms.
- 🔑 **API Key Rotation** – Rotate keys when rate limits are reached.
- 🔀 **Fallback Chains** – Switch between providers or models when requests fail.
- 📦 **Context Compaction** – Reduce conversation context when configured.
- 💰 **Budget Guard** – Track token usage and estimated API costs.
- 🔒 **Request Deduplication** – Prevent duplicate concurrent requests.
- 🌊 **Streaming Watchdog** – Detect stalled streams and retry.
- 🌐 **Fetch Integration** – Optionally apply retry logic to supported AI API requests.
- 🛠️ **Fluent API** – Configure RetryKit using a builder.
- 📦 **Zero Dependencies** – No runtime dependencies.

---

## Installation

```bash
npm install @rohan9024/retrykit
```

---

## Quick Start

```typescript
import { retry } from "@rohan9024/retrykit";

const result = await retry(
  async () => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello!" }],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
  {
    maxRetries: 3,
    timeoutMs: 30_000,
  }
);

console.log(result);
```

---

## API Key Rotation

Automatically rotate between API keys when requests encounter rate limits.

```typescript
import { retry } from "@rohan9024/retrykit";

const result = await retry(
  async (key) => {
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello!" }],
      }),
    });
  },
  {
    keys: [
      process.env.OPENAI_KEY_1!,
      process.env.OPENAI_KEY_2!,
      process.env.OPENAI_KEY_3!,
    ],
    maxRetries: 5,
  }
);
```

---

## Fallback Chains

Define multiple execution strategies and automatically move to the next one when a previous strategy fails.

```typescript
import { fallbackChain } from "@rohan9024/retrykit";

const result = await fallbackChain([
  {
    name: "OpenAI",
    run: () => callOpenAI(),
  },
  {
    name: "Anthropic",
    run: () => callAnthropic(),
  },
  {
    name: "Local LLM",
    run: () => callLocalModel(),
  },
]);

console.log(result);
```

---

## Context Compaction

Reduce large conversation contexts while preserving important messages and recent context.

```typescript
import { retry } from "@rohan9024/retrykit";

const result = await retry(
  async () => callLLM(messages),
  {
    maxRetries: 3,
    compaction: {
      enabled: true,
    },
  }
);
```

---

## Budget Guard

Track token usage and estimated API costs to help prevent unexpected spending.

```typescript
import { retry } from "@rohan9024/retrykit";

const result = await retry(
  async () => callLLM(),
  {
    budget: {
      maxTokens: 100_000,
      maxCost: 2.00,
    },
  }
);
```

---

## Request Deduplication

Prevent identical concurrent requests from executing multiple times.

```typescript
import { retry } from "@rohan9024/retrykit";

const request = () =>
  retry(
    async () => callLLM(),
    {
      deduplicate: true,
      deduplicationKey: "user-123-query",
    }
  );

const [result1, result2] = await Promise.all([
  request(),
  request(),
]);
```

---

## Streaming Protection

Detect stalled streams and automatically retry when streaming stops making progress.

```typescript
import { retryStream } from "@rohan9024/retrykit";

async function* stream() {
  // Your streaming implementation
}

for await (const chunk of retryStream(stream, {
  maxRetries: 3,
  stallTimeoutMs: 10_000,
})) {
  console.log(chunk);
}
```

---

## Global Fetch Integration

Automatically apply retry handling to supported AI API requests.

```typescript
import { patchGlobalFetch } from "@rohan9024/retrykit";

patchGlobalFetch({
  maxRetries: 3,
});
```

RetryKit can target supported AI API endpoints without changing every individual request.

---

## Fluent API

Configure RetryKit using a builder-style API.

```typescript
import { RetryKit } from "@rohan9024/retrykit";

const client = new RetryKit()
  .maxRetries(3)
  .timeout(30_000)
  .exponentialBackoff()
  .onRetry((error, attempt) => {
    console.log(`Retry attempt: ${attempt}`, error);
  });

const result = await client.execute(() => callLLM());
```

---

## Supported Providers

RetryKit is designed to work with AI API requests from providers including:

| Provider | Support |
|---|---|
| OpenAI | ✅ |
| Anthropic | ✅ |
| Google Gemini | ✅ |
| Groq | ✅ |
| DeepSeek | ✅ |
| Mistral | ✅ |
| Cohere | ✅ |
| Generic HTTP APIs | ✅ |

---

## API Reference

### `retry(operation, options)`

Execute an operation with retry and resilience logic.

| Option | Description |
|---|---|
| `maxRetries` | Maximum retry attempts |
| `timeoutMs` | Request timeout |
| `provider` | AI provider configuration |
| `backoff` | Retry backoff configuration |
| `signal` | AbortSignal |
| `keys` | API keys for rotation |
| `budget` | Token and cost budget configuration |
| `compaction` | Context compaction configuration |
| `deduplicate` | Enable request deduplication |
| `deduplicationKey` | Unique key for deduplication |
| `shouldRetry` | Custom retry condition |
| `onRetry` | Callback when retrying |
| `onKeyRotate` | Callback when rotating keys |
| `onCompacted` | Callback when context is compacted |
| `onSuccess` | Callback after success |
| `onError` | Callback after failure |

### `fallbackChain(steps)`

Execute multiple strategies sequentially until one succeeds.

### `retryStream(generator, options)`

Retry async generators when streams stall.

### `patchGlobalFetch(options)`

Apply retry behavior to supported AI API requests through global fetch.

### `RetryKit`

Fluent builder for configuring retry operations.

---

## Development

Clone the repository:

```bash
git clone https://github.com/rohan9024/retrykit.git
cd retrykit
```

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Type-check:

```bash
npm run typecheck
```

---

## Roadmap

- More provider-specific resilience strategies
- Better observability and retry metrics
- Additional streaming safeguards
- More advanced fallback policies
- Improved configuration ergonomics

---

## Contributing

Contributions, bug reports, feature requests, and feedback are welcome.

Feel free to open an issue or submit a pull request.

---

## License

MIT License.
