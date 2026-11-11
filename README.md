# @rohan9024/retrykit ⚡

> Zero-dependency, header-aware retry wrapper tailored for LLM APIs and fetch.

Automatically handles `429 Too Many Requests` by parsing rate-limit headers from OpenAI, Anthropic, and Groq before falling back to exponential backoff with full jitter.

---

## 📦 Installation

```bash
npm install @rohan9024/retrykit
```

---

## 🚀 Usage

### 1. Drop-in Replacement for `fetch` (`retryFetch`)

`retryFetch` works exactly like standard `fetch`, but automatically handles retries and honors rate-limit headers:

```typescript
import { retryFetch } from '@rohan9024/retrykit';

const response = await retryFetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Say hello!' }],
  }),
}, {
  retries: 3,
  onRetry: (error, attempt, delayMs) => {
    console.warn(`Retry attempt #${attempt} after ${delayMs}ms delay...`);
  },
});

const data = await response.json();
```

---

### 2. Wrap Official SDKs (`retry`)

Wrap calls from the official OpenAI, Anthropic, or Mistral client libraries:

```typescript
import OpenAI from 'openai';
import { retry } from '@rohan9024/retrykit';

const openai = new OpenAI();

const completion = await retry(() =>
  openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a haiku' }],
  }),
  {
    retries: 4,
    baseDelayMs: 500,
  }
);
```

---

## 🧠 Provider Header Awareness

`retrykit` inspects and obeys the following provider headers before falling back to exponential backoff:

- `retry-after` (RFC 1123 HTTP Dates or relative seconds)
- `x-ratelimit-reset-requests` (OpenAI format, e.g., `"15s"`, `"600ms"`)
- `x-ratelimit-reset-tokens` (Anthropic format)

---

## ⚙️ Options Reference

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `retries` | `number` | `3` | Max retry attempts before failing |
| `baseDelayMs` | `number` | `500` | Starting backoff delay in ms |
| `maxDelayMs` | `number` | `30000` | Ceiling delay cap in ms |
| `retryOnStatus`| `number[]` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry |
| `onRetry` | `(err, attempt, delay) => void` | `undefined` | Hook called before every sleep |
| `signal` | `AbortSignal` | `undefined` | Immediate cancellation controller |

---

## 📄 License

MIT