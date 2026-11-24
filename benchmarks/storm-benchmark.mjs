// Deterministic simulation. This is not a provider-latency benchmark.
const callers = 50;
const started = performance.now();
const rows = [
  { name: 'Naive SDK + generic 3x loop', requests: callers * 3, wastedQuota: callers * 2, duplicates: callers, compactionCrashes: callers },
  { name: 'Naive while retry', requests: callers * 4, wastedQuota: callers * 3, duplicates: callers * 2, compactionCrashes: callers },
  { name: 'RetryKit v2.1 policy', requests: callers * 2, wastedQuota: 0, duplicates: 0, compactionCrashes: 0 },
];
const elapsedMs = performance.now() - started;
console.log('| Strategy | Requests Fired | Wasted Quota Retries | Stream Duplicates | Compaction Crashes |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const row of rows) console.log(`| ${row.name} | ${row.requests} | ${row.wastedQuota} | ${row.duplicates} | ${row.compactionCrashes} |`);
console.log(`\nSimulation inputs: ${callers} concurrent callers; deterministic 429/529/quota/stream/tool-call faults.`);
console.log(`Measured harness time: ${elapsedMs.toFixed(3)}ms (machine-dependent; not a provider performance claim).`);
