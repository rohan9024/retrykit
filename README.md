# @rohan9024/retrykit v2.1.2

The reliability and traffic-control engine for AI applications: provider-aware retries, rate-limit coordination, cancellation, key rotation, circuit breaking, and safe stream recovery—with zero runtime dependencies.

## Quick start

```bash
npm i @rohan9024/retrykit
# Node.js >=22 is required
```

```ts
import OpenAI from 'openai';
import { wrapOpenAI } from '@rohan9024/retrykit/auto';

const client = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }));
const result = await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello' }] });
```

## Vibe-coder prompt

> Install `@rohan9024/retrykit`, inspect existing provider retry behavior, use `@rohan9024/retrykit/auto` or a focused subpath, set nested SDK retries to `0`, and run the project checks. Never use the unscoped `retrykit` package.

Install the coding-agent skill separately:

```bash
npx skills add rohan9024/retrykit --skill retrykit
```

## Modules

| Import | Purpose |
| --- | --- |
| `@rohan9024/retrykit` | Curated root API |
| `/core` | Retry, backoff, providers, circuit breaker, coordinator |
| `/auto` | Nested client proxy and environment key discovery |
| `/fetch` | Abort-aware HTTP retries and idempotency policies |
| `/stream` | Checkpoint-safe stream recovery |
| `/compaction` | Tool-call-safe context compaction |
| `/budget` | Retry and cost budget primitives |
| `/validate` | Structural Standard Schema validation retries |
| `/mcp` | Explicitly idempotent MCP retries |
| `/ai-sdk` | Structural Vercel AI SDK middleware |
| `/otel` | Zero-dependency, secret-scrubbed GenAI span hooks |
| `/stores/upstash` | Edge-safe Upstash REST state store |
| `/testing` | Deterministic Fault Lab utilities |

## Reliability rules

- Retry only safe or explicitly idempotent operations.
- A stream is resumable only when `getCheckpoint` is supplied.
- Set SDK retries to `0` when RetryKit owns the policy.
- Built-in coordination state is process-local.
- Pricing and token estimates are estimates unless based on actual provider usage.
- `POST` and `PATCH` retries require an idempotency key or explicit replay approval.
- Unclassified errors are not retried by default.

## Honest comparison

RetryKit focuses on AI-provider concerns—rate-limit headers, key pools, stream checkpoints, budgets, and agent-friendly subpaths. `p-retry`, `async-retry`, and `cockatiel` remain good generic promise-retry choices; Axios Retry and Opossum target HTTP and circuit breaking. Provider SDKs and AI frameworks may overlap, so avoid stacking policies.

## Development

```bash
npm run typecheck
npm test
npm run build
```

## CLI and migration

Use `npx @rohan9024/retrykit doctor --json` to audit SDK retry settings, `npx @rohan9024/retrykit eval` to run deterministic Fault Lab scenarios, `npx @rohan9024/retrykit init --dry-run` to preview setup, and `npx @rohan9024/retrykit mcp` for the stdio MCP server.

Migrating from `p-retry`: use `retry()` for promise operations, `createRetryFetch()` for HTTP, and the provider-aware policy when rate-limit headers, billing classification, stream checkpoints, or replay safety matter. Keep `p-retry` for generic non-AI work that does not need these guarantees.

## CI / PR Audit Action

```yaml
- uses: rohan9024/retrykit@v2
  with:
    fail-on-error: 'true'
    sarif-file: retrykit-doctor.sarif
```

The action writes a SARIF report and prints JSON findings. It fails only for error-severity findings when `fail-on-error` is enabled.

## Fault Lab

Try the static Fault Lab at https://rohan9024.github.io/retrykit/ for deterministic demonstrations of retry storms, stream interruptions, and tool-call safety.

## Reproducible benchmark simulation

Run `node benchmarks/storm-benchmark.mjs` for the deterministic 50-caller Fault Lab simulation. The current measured policy table is:

| Strategy | Requests Fired | Wasted Quota Retries | Stream Duplicates | Compaction Crashes |
| --- | ---: | ---: | ---: | ---: |
| Naive SDK + generic 3x loop | 150 | 100 | 50 | 50 |
| Naive while retry | 200 | 150 | 100 | 50 |
| RetryKit v2.1 policy | 100 | 0 | 0 | 0 |

These are deterministic simulation counts, not provider-latency or download claims.

MIT licensed.
