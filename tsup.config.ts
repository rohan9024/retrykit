import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts', 'src/register.ts', 'src/core.ts', 'src/fetch.ts',
    'src/stream.ts', 'src/compaction.ts', 'src/budget.ts', 'src/auto.ts',
    'src/validate.ts', 'src/mcp.ts', 'src/ai-sdk.ts', 'src/cli.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
});
