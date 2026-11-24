This project is `@rohan9024/retrykit` (currently v2.1.2), a zero-runtime-dependency TypeScript library for network reliability and rate-limit coordination in AI applications. Node.js >=22 is required.

## Architecture Guidelines

1. Never add runtime dependencies to `package.json`; development-only typings are allowed.
2. Never hold a `ProviderCoordinator` slot while sleeping during backoff.
3. Always require `getCheckpoint` in `retryStream` before claiming resumption.
4. Emit dual CJS and ESM builds plus declarations through `tsup`.
5. Use the scoped package name in imports and CLI examples; never assume unscoped `retrykit` is owned by this project.
6. Keep `src/cli.ts` isolated from browser, edge, and core entrypoints.
7. Do not retry unclassified errors or unsafe POST/PATCH requests without explicit idempotency approval.
8. Prefer `wrapOpenAI`/`wrapAnthropic` and force provider SDK `maxRetries: 0`.

## Testing

```bash
npm run typecheck
npm run test
npm run build
```
