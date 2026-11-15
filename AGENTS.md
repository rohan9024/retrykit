This project is `@rohan9024/retrykit` (v0.4.0), a zero-runtime-dependency TypeScript library for network reliability and rate-limit coordination in AI applications.

## Architecture Guidelines
1. Zero Runtime Dependencies: Never add runtime dependencies to `package.json`.
2. Concurrency Safety: Never hold a concurrency slot in `ProviderCoordinator` while sleeping during backoff.
3. Stream Invariant: Always require `getCheckpoint` in `retryStream` before claiming resumption to avoid duplicate token output.
4. TypeScript: Dual CJS and ESM builds emitted to `dist/` via `tsup`.

## Testing
Always verify changes with:
```bash
npm run typecheck
npm run test
npm run build