import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts', 'src/register.ts', 'src/core.ts', 'src/fetch.ts',
    'src/stream.ts', 'src/compaction.ts', 'src/budget.ts', 'src/auto.ts',
    'src/validate.ts', 'src/mcp.ts', 'src/ai-sdk.ts', 'src/cli.ts', 'src/otel.ts',
    'src/policy/classify.ts', 'src/policy/replay-safety.ts', 'src/stores/upstash.ts', 'src/testing/chaos.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
  minify: false,
});
