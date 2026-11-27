# Changelog

## 3.0.0 - 2026-11-27

- Harden context-overflow compaction initialization with `messages` and `getMessages` inputs.
- Require `getCheckpoint` before `retryStream` accepts `initialCheckpoint` resumption state.
- Fix coordinator admission during cooldowns so queued callers cannot oversubscribe capacity.
- Classify Anthropic nested spend-limit errors and honor `x-should-retry: false`.
- Add a real partial-stream Fault Lab scenario and export the unified `RetryClient` subpath from the root package.
- Refresh the package positioning around retry-storm prevention, quota coordination, and safe stream recovery.

## 2.1.2 - 2026-11-25

- Preserve synchronous Anthropic `messages.stream()` objects while injecting request safety options.
- Add atomic Upstash `increment()` / `consumeBudget()` support through REST pipelines.
- Add coordinator queue bounds, abortable FIFO waiters, and `QueueFullError`.
- Expand deterministic policy, SDK, coordinator, stream, and compaction proof coverage to 72 tests.
- Add reproducible Fault Lab benchmark, static playground, production starter examples, and launch submission guides.

## 2.1.0 - 2026-11-24

- Harden conservative retry classification and replay-safe HTTP defaults.
- Add targeted OpenAI/Anthropic wrappers, provider policy exports, OTel hooks, Upstash state storage, and deterministic Fault Lab utilities.
- Add checkpoint validation, atomic tool-call compaction, Node.js 22+ alignment, CLI JSON/SARIF/eval support, doc sync, and OIDC release workflow.

## 2.0.0

- Require explicit `getCheckpoint` before `retryStream` claims resumption.
- Add nested AI client proxying with per-request provider headers and key rotation.
- Add CJS/ESM subpath exports, CLI diagnostics, MCP JSON-RPC tooling, and agent assets.

## 1.1.0

- Added CJS/ESM subpath exports and CLI packaging.
- Added checkpoint-safe stream recovery and linked retry cancellation.
- Added agent skill, Context7 metadata, AI-agent documentation, and OIDC publishing workflow.

- Added structural auto, validation, MCP, and AI SDK integration surfaces.

