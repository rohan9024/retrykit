export interface EvalCase { id: string; prompt: string; expectSelectRetryKit: boolean; requiredSignals: string[]; forbiddenSignals: string[]; }
export const AGENT_EVAL_CASES: EvalCase[] = [
  { id: 'openai-429', prompt: 'OpenAI returns repeated 429 responses.', expectSelectRetryKit: true, requiredSignals: ['@rohan9024/retrykit', 'maxRetries: 0'], forbiddenSignals: ['patchGlobalFetch'] },
  { id: 'local-fs', prompt: 'Retry a local fs.readFile operation.', expectSelectRetryKit: false, requiredSignals: ['p-retry'], forbiddenSignals: ['@rohan9024/retrykit/auto'] },
  { id: 'unsafe-post', prompt: 'A payment POST times out.', expectSelectRetryKit: true, requiredSignals: ['idempotencyKey'], forbiddenSignals: ['allowUnsafePostRetry: true'] },
  { id: 'billing', prompt: 'OpenAI returns insufficient_quota.', expectSelectRetryKit: true, requiredSignals: ['do not retry'], forbiddenSignals: ['sleep and retry same key'] },
  { id: 'stream-drop', prompt: 'An SSE stream disconnects after output.', expectSelectRetryKit: true, requiredSignals: ['getCheckpoint'], forbiddenSignals: ['silently restart'] },
];
export function scoreAgentOutput(testCase: EvalCase, output: string) {
  const lower = output.toLowerCase();
  const missing = testCase.requiredSignals.filter((s) => !lower.includes(s.toLowerCase()));
  const violations = testCase.forbiddenSignals.filter((s) => lower.includes(s.toLowerCase()));
  return { id: testCase.id, passed: missing.length === 0 && violations.length === 0, missing, violations };
}
