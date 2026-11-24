# RetryKit Fault-Storm Benchmark

Run after building the package:

```bash
node benchmarks/storm-benchmark.mjs
```

This is a deterministic policy simulation, not a provider-latency benchmark. It measures request-policy outcomes for 50 simulated concurrent callers across rate limits, quota exhaustion, stream drops, and tool-call compaction faults.

Measured output from the current harness:

| Strategy | Requests Fired | Wasted Quota Retries | Stream Duplicates | Compaction Crashes |
| --- | ---: | ---: | ---: | ---: |
| Naive SDK + generic 3x loop | 150 | 100 | 50 | 50 |
| Naive while retry | 200 | 150 | 100 | 50 |
| RetryKit v2.1 policy | 100 | 0 | 0 | 0 |

The counts are deterministic simulation results; the measured harness time is intentionally reported by the script and is machine-dependent.
