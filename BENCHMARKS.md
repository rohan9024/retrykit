# Benchmarks

`benchmarks/run-benchmarks.mjs` is a local dependency-free harness. It reports measurements from the machine and Node version where it is run; this repository does not claim benchmark numbers that have not been generated there.

It measures raw promise overhead and a deterministic retry workload. Network and provider performance are intentionally excluded because they are environment-dependent.
