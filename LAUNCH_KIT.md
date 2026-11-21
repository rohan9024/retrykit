# RetryKit v2.0.0 launch kit

Verified package link: `https://www.npmjs.com/package/@rohan9024/retrykit`.

## Show HN

**RetryKit v2.0.0 — zero-dependency reliability and traffic control for AI apps**

RetryKit adds provider-aware retries, rate-limit coordination, circuit breaking, per-request key rotation, checkpoint-safe stream recovery, and retry budgets for TypeScript AI applications. It ships CJS, ESM, declarations, focused subpaths, a CLI doctor, and an Agent Skill. Runtime dependencies remain empty.

Package: https://www.npmjs.com/package/@rohan9024/retrykit
Repository: https://github.com/rohan9024/retrykit

## Dev.to / Hashnode

**Title:** Why naive retries corrupt LLM streams

LLM retries are not just exponential backoff. A request can be rate-limited, a provider can return a disguised stream failure, or a connection can drop after tokens have already reached the UI. RetryKit v2.0.0 makes the safety boundary explicit: a stream resumes only when the application supplies `getCheckpoint`; otherwise it fails rather than silently duplicating output.

The package also provides provider-aware headers, hard-billing fast-fail classification, circuit breaking, bounded coordination, and zero-runtime-dependency subpaths.

Install: `npm i @rohan9024/retrykit@2.0.0`

## Reddit draft

I released `@rohan9024/retrykit@2.0.0`, a zero-runtime-dependency TypeScript library for AI reliability. It focuses on rate-limit coordination, retry-storm prevention, circuit breakers, safe streaming recovery, and per-request provider key rotation. The repository contains the tests and build commands; feedback and integration examples are welcome.

Link: https://github.com/rohan9024/retrykit

Follow each community's self-promotion rules and disclose that this is the author's project.

## X draft

AI retries need more than backoff. RetryKit v2.0.0 adds provider-aware rate limits, hard-billing fast-fail, circuit breaking, per-request key rotation, checkpoint-safe stream recovery, CJS/ESM subpaths, and an AI-agent skill—with zero runtime dependencies.

https://www.npmjs.com/package/@rohan9024/retrykit

## Claim discipline

Do not claim download counts, benchmark superiority, endorsements, or external integrations unless separately verified. The repository benchmark is synthetic and local-only.
