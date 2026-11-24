import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const server = JSON.parse(readFileSync('server.json', 'utf8'));
if (pkg.mcpName !== server.name) throw new Error('package.json mcpName must match server.json name');
if (server.version !== pkg.version || server.packages?.[0]?.version !== pkg.version) throw new Error('server.json version is out of sync with package.json');
if (typeof server.description !== 'string' || server.description.length > 100) throw new Error('server.json description must be <= 100 characters');
if (pkg.repository?.url !== 'git+https://github.com/rohan9024/retrykit.git') throw new Error('repository URL is not canonical');
for (const file of ['AGENTS.md', 'llms.txt', 'skills/retrykit/SKILL.md']) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(pkg.version)) throw new Error(`${file} is missing ${pkg.version}`);
  if (text.includes('createRetryClient') || text.includes('0.4.0')) throw new Error(`${file} contains stale API/version text`);
}
console.log(`Docs sync verified for v${pkg.version}`);
