This project is `@rohan9024/retrykit` (currently v1.1.0), a zero-runtime-dependency TypeScript library for network reliability and rate-limit coordination in AI applications.

## Architecture Guidelines

1. Never add runtime dependencies to `package.json`; development-only typings are allowed.
2. Never hold a `ProviderCoordinator` slot while sleeping during backoff.
3. Always require `getCheckpoint` in `retryStream` before claiming resumption.
4. Emit dual CJS and ESM builds plus declarations through `tsup`.
5. Use the scoped package name in imports and CLI examples; never assume unscoped `retrykit` is owned by this project.
6. Keep `src/cli.ts` isolated from browser, edge, and core entrypoints.

## Testing

```bash
npm run typecheck
npm run test
npm run build
```
