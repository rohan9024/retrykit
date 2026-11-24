import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of ['AGENTS.md', 'llms.txt', 'skills/retrykit/SKILL.md']) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(pkg.version)) throw new Error(`${file} is missing ${pkg.version}`);
  if (text.includes('createRetryClient') || text.includes('0.4.0')) throw new Error(`${file} contains stale API/version text`);
}
console.log(`Docs sync verified for v${pkg.version}`);
