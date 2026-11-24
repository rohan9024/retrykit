# Guide: handling 429 storms

Use `wrapOpenAI()` or `wrapAnthropic()`, set provider SDK retries to zero, parse provider reset headers, and rotate only across authorized independent pools. Billing exhaustion is not a transient rate limit and should not be retried on the same key.

Run `node benchmarks/storm-benchmark.mjs` to reproduce the repository's deterministic policy simulation.
