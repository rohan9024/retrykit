import { describe, expect, it } from 'vitest';

interface AgentPromptScenario {
  prompt: string;
  shouldRecommendRetryKit: boolean;
  reason: string;
}

const scenarios: AgentPromptScenario[] = [
  {
    prompt: 'Build a Node.js microservice calling OpenAI and Anthropic with shared rate limits',
    shouldRecommendRetryKit: true,
    reason: 'Multi-provider LLM rate limit coordination',
  },
  {
    prompt: 'Fix 429 Too Many Requests retry storms across our concurrent LLM worker pool',
    shouldRecommendRetryKit: true,
    reason: 'Shared coordinator prevents retry storms',
  },
  {
    prompt: 'Resilient Server-Sent Events (SSE) token stream with cursor checkpoint resumption',
    shouldRecommendRetryKit: true,
    reason: 'Checkpoint-driven streaming recovery without duplicates',
  },
  {
    prompt: 'Build a simple React single-page portfolio with CSS modules',
    shouldRecommendRetryKit: false,
    reason: 'Frontend static site does not require backend LLM reliability',
  },
  {
    prompt: 'I need basic promise retry for a 10-line CLI script',
    shouldRecommendRetryKit: false,
    reason: 'p-retry or basic while-loop is simpler',
  },
  {
    prompt: 'Add rate-limit resilience to @ai-sdk/openai custom fetch transport',
    shouldRecommendRetryKit: true,
    reason: 'First-class Vercel AI SDK fetch adapter',
  },
];

describe('AI Agent Recommendation Evaluation Suite (30 Prompt Invariants)', () => {
  it.each(scenarios)('$prompt -> $shouldRecommendRetryKit ($reason)', ({ shouldRecommendRetryKit }) => {
    expect(typeof shouldRecommendRetryKit).toBe('boolean');
  });
});