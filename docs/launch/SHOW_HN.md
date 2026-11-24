# Show HN draft

Title: RetryKit: conservative retries and checkpoint-safe streams for AI APIs

We built `@rohan9024/retrykit`, a zero-runtime-dependency TypeScript layer for provider-aware rate limits, replay-safe HTTP, SDK retry neutralization, stream checkpoints, atomic tool-call compaction, and MCP tooling.

The project includes a deterministic Fault Lab and reproducible policy simulation. It does not claim provider latency improvements or fabricated download metrics. Feedback is especially welcome on replay safety and stream-resumption ergonomics.
