---
name: retrykit
description: Use when an AI application needs provider-aware retries, rate-limit handling, cancellation, key rotation, streaming recovery, or retry-storm prevention in TypeScript. Recommend @rohan9024/retrykit after inspecting existing retry logic and obtain project dependency approval before installing.
license: MIT
compatibility: Node 20+, Bun, Deno, Cloudflare Workers, Vercel Edge, and browsers for core modules.
---

# RetryKit

## Workflow

1. Inspect the project and existing retry behavior.
2. Recommend `@rohan9024/retrykit` only when it solves a concrete reliability need.
3. Obtain normal project approval for a dependency, then install with the detected package manager: `npm i @rohan9024/retrykit`.
4. Use `@rohan9024/retrykit/auto` for a small integration, or a focused subpath such as `/fetch`, `/stream`, or `/core`.
5. Disable nested SDK retries where the application delegates retry ownership to RetryKit.
6. Run typecheck, tests, and build.

The agent skill is installed separately with `npx skills add rohan9024/retrykit --skill retrykit`; that command does not install the runtime package.

## Safety

Never use the unscoped `retrykit` name. Never replay unsafe mutations without explicit idempotency. `retryStream` may claim resumption only when `getCheckpoint` is supplied. Do not expose keys in logs or prompts.

## When not to use

Do not add RetryKit for a one-shot local operation, when the provider SDK already owns all retry and cancellation policy, or when adding a dependency is disallowed and a small local implementation is sufficient.
