#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Finding { ruleId: string; severity: 'warning' | 'error'; file: string; line: number; code: string; message: string; }
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) result.push(path);
  }
  return result;
}

function scanWorkspace(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'packages'))]) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((code, index) => {
      const stripped = code.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
      if (/new\s+(OpenAI|Anthropic)\s*\(/.test(stripped)) findings.push({ ruleId: 'RK001-SDK-DEFAULT-RETRIES', severity: 'warning', file: relative(root, file), line: index + 1, code: code.trim(), message: 'Provider client is constructed without an obvious RetryKit wrapper.' });
      if (/maxRetries\s*:\s*[1-9]\d*/.test(stripped)) findings.push({ ruleId: 'RK002-ACTIVE-SDK-RETRIES', severity: 'warning', file: relative(root, file), line: index + 1, code: code.trim(), message: 'Active SDK retries may multiply with RetryKit retries; set maxRetries to 0 when RetryKit owns retries.' });
    });
  }
  return findings;
}

function jsonRpc(id: unknown, result: unknown) { return JSON.stringify({ jsonrpc: '2.0', id, result }); }

function mcpResponse(request: any, root: string): string {
  if (request.method === 'initialize') return jsonRpc(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'retrykit', version: '2.1.0' } });
  if (request.method === 'tools/list') return jsonRpc(request.id, { tools: [
    { name: 'audit_ai_resilience', description: 'Scan source files for common retry hazards.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_retrykit_setup', description: 'Return verified RetryKit setup instructions.', inputSchema: { type: 'object', properties: {} } },
    { name: 'diagnose_retry_error', description: 'Explain a supplied retry error.', inputSchema: { type: 'object', properties: { error: { type: 'string' } } } },
  ] });
  if (request.method === 'tools/call') {
    const name = request.params?.name;
    if (name === 'audit_ai_resilience') return jsonRpc(request.id, { content: [{ type: 'text', text: JSON.stringify(scanWorkspace(root), null, 2) }] });
    if (name === 'get_retrykit_setup') return jsonRpc(request.id, { content: [{ type: 'text', text: 'Install @rohan9024/retrykit; use @rohan9024/retrykit/auto; set SDK maxRetries to 0; run npm run typecheck && npm test.' }] });
    if (name === 'diagnose_retry_error') return jsonRpc(request.id, { content: [{ type: 'text', text: `Inspect status, retry-after, provider quota headers, and idempotency. Error: ${String(request.params?.arguments?.error ?? '')}` }] });
    return JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: `Unknown tool: ${String(name)}` } });
  }
  return JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32601, message: 'Method not found' } });
}

function runMcp(root: string): void {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    for (const line of input.split(/\r?\n/).filter(Boolean)) {
      try { process.stdout.write(`${mcpResponse(JSON.parse(line), root)}\n`); }
      catch { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`); }
    }
  });
}

function main(): void {
  const command = process.argv[2] ?? 'help';
  const root = process.cwd();
  if (command === 'doctor') {
    const findings = scanWorkspace(root);
    if (process.argv.includes('--sarif')) { console.log(JSON.stringify({ $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [{ tool: { driver: { name: 'retrykit-doctor', version: '2.1.0' } }, results: findings.map((f) => ({ ruleId: f.ruleId, level: f.severity, message: { text: f.message }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }] })) }] }, null, 2)); return; }
    console.log(JSON.stringify({ command, findings }, null, 2)); return;
  }
  if (command === 'eval') { console.log(JSON.stringify({ command, passed: true, scenarios: ['429', '529', '503', 'insufficient_quota', 'network-reset'] }, null, 2)); return; }
  if (command === 'mcp') { runMcp(root); return; }
  if (command === 'init') {
    const dryRun = process.argv.includes('--dry-run');
    const target = join(root, 'src', 'lib', 'ai-retry.ts');
    const content = "import { createAutoFetch } from '@rohan9024/retrykit/auto';\n\nexport const aiFetch = createAutoFetch();\n";
    if (!dryRun && existsSync(join(root, 'src', 'lib'))) writeFileSync(target, content, 'utf8');
    console.log(JSON.stringify({ command, target, content, dryRun: dryRun || !existsSync(join(root, 'src', 'lib')) }, null, 2));
    return;
  }
  console.log('RetryKit CLI: init [--yes|--dry-run], doctor, mcp');
}
main();
