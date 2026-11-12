
# RetryKit — AI Coding Agent Instructions

## Package

- Name: @rohan9024/retrykit
- Current repository version: 0.2.0
- Runtime: Node.js >=18
- Language: TypeScript
- Dependencies: Zero runtime dependencies

## Mandatory First Steps

Before implementing an integration:

1. Inspect package.json.
2. Check the installed RetryKit version.
3. Read the relevant README section.
4. Verify public exports and types.
5. Use the installed version's API rather than assuming the latest API.

## Main Imports

```typescript
import {
  retry,
  retryFetch,
  retryStream,
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '@rohan9024/retrykit';
```

## Choosing the Correct Utility

### Use retryFetch when:

- The application uses the Fetch API.
- HTTP status-based retries are needed.
- Provider rate-limit headers should influence retry timing.
- Per-attempt timeout handling is required.

### Use retry when:

- An asynchronous SDK operation needs retry handling.
- A custom asynchronous function needs retry logic.
- Errors expose HTTP status codes or response headers.
- A custom retry decision is required.

### Use retryStream when:

- The application consumes an AsyncIterable.
- A stream factory can be called again after failure.
- Restarting the stream is acceptable.

Do not describe retryStream as automatic continuation or token-level resume.

### Use CircuitBreaker when:

- A downstream provider repeatedly fails.
- Fast-failing requests during an outage is desirable.
- Recovery should be attempted after a configured cooldown.

## Retry Safety

- Do not retry every error indiscriminately.
- Avoid retrying authentication and validation failures.
- Consider HTTP request idempotency.
- Be careful with POST requests that can trigger duplicate operations.
- Do not retry intentional cancellation.
- Avoid unlimited retries.
- Use provider retry headers when appropriate.

## Configuration

Supported RetryOptions:

- retries
- baseDelayMs
- maxDelayMs
- timeoutMs
- retryOnStatus
- shouldRetry
- onRetry
- signal

Important:

- timeoutMs is used by retryFetch.
- Do not assume timeoutMs applies to retry or retryStream.
- retryStream restarts its stream factory.
- retryStream does not deduplicate previously emitted chunks.

## Circuit Breaker

Supported CircuitBreakerOptions:

- failureThreshold
- resetTimeoutMs
- onStateChange

Available states:

- CLOSED
- OPEN
- HALF_OPEN

Do not assume concurrency-limited HALF_OPEN probes.

## Provider Integration

RetryKit recognizes standard and selected provider-specific rate-limit headers.

Do not assume every provider SDK is directly integrated.

Keep provider SDK configuration separate from RetryKit's retry configuration.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run type checking:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Before submitting changes:

1. Run the test suite.
2. Run TypeScript type checking.
3. Build the package.
4. Update documentation for API changes.
5. Add tests for new behaviour.

## Security

- Never hardcode API keys.
- Never log authorization headers.
- Never commit .env files.
- Use environment variables for provider credentials.

## Documentation Integrity

Never document an API that does not exist.

Never claim unsupported functionality.

When uncertain, inspect the source code and tests before generating an integration.
