import { performance } from 'node:perf_hooks';

const iterations = Number(process.env.RETRYKIT_BENCHMARK_ITERATIONS ?? 10000);
const start = performance.now();
for (let i = 0; i < iterations; i++) await Promise.resolve(i);
const elapsed = performance.now() - start;

let attempts = 0;
const retryStart = performance.now();
for (let i = 0; i < 100; i++) {
  let done = false;
  while (!done) { attempts++; done = attempts % 2 === 0; }
}
const retryElapsed = performance.now() - retryStart;

console.log(JSON.stringify({ node: process.version, platform: process.platform, iterations, promiseOverheadMs: Number(elapsed.toFixed(3)), deterministicRetryWorkMs: Number(retryElapsed.toFixed(3)), attempts, note: 'Local synthetic measurements only; not provider or production latency claims.' }, null, 2));
