# Ecosystem submission kit

## Context7

Repository: `https://github.com/rohan9024/retrykit`

Description: `@rohan9024/retrykit is a zero-runtime-dependency TypeScript reliability layer for provider-aware retries, rate-limit parsing, replay-safe HTTP, checkpointed streams, and MCP tooling. Current release: v2.1.0, Node.js >=22.`

## MCP directories

Install command: `npx -y @rohan9024/retrykit@latest mcp`

The server exposes `initialize`, `tools/list`, and `tools/call`, including an AI resilience audit tool.

## skills.sh

Install command: `npx skills add rohan9024/retrykit --skill retrykit`

## Community directories

Submit the GitHub repository and link to the published README. Do not claim download counts or performance numbers beyond the repository's reproducible benchmark output.
# Distribution and submission copy

## Official MCP Registry

PowerShell:

```powershell
$bin = Join-Path $env:TEMP 'mcp-publisher.exe'
Invoke-WebRequest https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher-windows-amd64.exe -OutFile $bin
& $bin validate server.json
& $bin login github
& $bin publish server.json
```

macOS/Linux:

```bash
brew install modelcontextprotocol/tap/mcp-publisher
mcp-publisher validate server.json
mcp-publisher login github
mcp-publisher publish server.json
```

Verify:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.rohan9024%2Fretrykit/versions/latest"
```

Suggested description: “AI/LLM retry diagnostics, SDK double-retry audit, and fault evaluation MCP server.”

## Context7

Submit `https://github.com/rohan9024/retrykit` at https://context7.com/add-library, then claim and request verification at https://context7.com/rohan9024/retrykit/admin.

## Directory submissions

- Smithery: https://smithery.ai/new
- Glama: https://glama.ai/mcp/servers
- PulseMCP: submit registry identity `io.github.rohan9024/retrykit`
- LobeHub: https://lobehub.com/mcp
- Cursor Directory: https://cursor.directory
- Skills: `npx skills add rohan9024/retrykit --skill retrykit`

## awesome-mcp-servers PR snippet

```markdown
- [RetryKit](https://github.com/rohan9024/retrykit) - AI/LLM retry diagnostics, SDK double-retry auditing, rate-limit coordination, stream recovery, and fault evaluation via MCP.
```

Add the line alphabetically in the appropriate section of `punkpeye/awesome-mcp-servers`.

## Ecosystem snippets

- Vercel AI SDK: “RetryKit adds provider-aware retry classification, SDK double-retry prevention, safe stream checkpoints, and idempotency-aware middleware for TypeScript AI applications.”
- Mastra: “Use RetryKit around provider calls when rate-limit headers, key pools, replay safety, and stream recovery must be explicit.”
- awesome-typescript: “RetryKit is a zero-runtime-dependency TypeScript reliability toolkit for LLM APIs and agent workflows.”
- awesome-nodejs: “RetryKit provides Node.js AI API retries, rate-limit coordination, circuit breakers, and MCP diagnostics.”

## Launch checklist

Before submitting `docs/launch/SHOW_HN.md`, verify https://rohan9024.github.io/retrykit/ is live and its buttons work. Pages must be green first.
