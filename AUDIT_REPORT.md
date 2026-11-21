# RetryKit audit report

## Scope and baseline

Audit performed 21 November 2026 against the working tree on Node v22.22.2. The tree was already on `main` with an untracked `src.zip`; that artifact was preserved. The package is currently version 1.1.0 despite the project brief mentioning 0.4.0. Published-package inspection with `npm view` could not complete in the available network window, so no registry claims are made here.

## Confirmed findings

- `npm run typecheck` was missing and the existing TypeScript graph had missing public type definitions, so a clean typecheck could not run.
- `package.json` exposed only `.` and `./register`, although source modules were intended to be consumed independently.
- `retry()` used `Promise.race` for timeouts without passing an abort signal to the operation.
- `retryStream()` had a `getCheckpoint` test but did not read that option; resumption was inferred from other option names.
- The CLI, agent skill, Context7 metadata, and OIDC workflow were absent.
- `CircuitBreaker` had runtime options (`halfOpenMaxCalls`, `shouldCountFailure`) not represented in the public type.
- Model pricing is a static estimate; it must remain documented as estimated rather than billing-exact.

## Changes made

The release candidate adds explicit `typecheck`, tree-shakeable subpath exports, a zero-runtime-dependency auto/validation/MCP/AI-SDK surface, CLI entry point, checkpoint-aware stream handling, linked retry cancellation, agent discovery files, and a publish workflow that uses npm trusted publishing. Existing API names were retained.

## Verify-first items not asserted

No benchmark result, download count, endorsement, registry tarball comparison, Node 20/24 run, or external integration is claimed without an executed verification in this environment. A release owner should run the clean tarball matrix before publishing.

## Security and compatibility notes

Do not use the unscoped `retrykit` package name without independently verifying ownership. Retry non-idempotent requests only with explicit application-level idempotency. The built-in stores and coordinator state are process-local. Pricing values are estimates and should be supplied by the application when billing accuracy matters.

## Priorities before release

1. Run the full required checks and tarball import matrix on Node 20, 22, and 24.
2. Expand CLI `doctor` and `mcp` from the current safe baseline into a full read-only scanner.
3. Validate the agent skill with the current agentskills.io validator and review generated docs.
4. Configure the npm Trusted Publisher in the npm UI; do not add an npm token secret.
