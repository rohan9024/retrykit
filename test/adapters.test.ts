import { describe, expect, it } from 'vitest';
import {
  anthropicAdapter,
  azureAdapter,
  geminiAdapter,
  groqAdapter,
  openAIAdapter,
} from '../src/adapters.js';

describe('Provider Adapters', () => {
  it('OpenAI parses project-scoped token resets', () => {
    const headers = {
      'x-ratelimit-remaining-project-tokens': '0',
      'x-ratelimit-reset-project-tokens': '10s',
    };
    const res = openAIAdapter.parseRateLimit(headers);
    expect(res?.retryAfterMs).toBe(10000);
    expect(res?.exhaustedDimensions).toContain('project_tokens');
  });

  it('Anthropic parses token resets with remaining quota mapping', () => {
    const headers = {
      'anthropic-ratelimit-tokens-remaining': '0',
      'anthropic-ratelimit-tokens-reset': '6s',
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-reset': '1s',
    };
    const res = anthropicAdapter.parseRateLimit(headers);
    expect(res?.retryAfterMs).toBe(6000);
    expect(res?.exhaustedDimensions).toEqual(['tokens']);
  });

  it('Groq evaluates both TPM and RPD and returns maximum', () => {
    const headers = {
      'x-ratelimit-remaining-tokens': '0',
      'x-ratelimit-reset-tokens': '2s',
      'x-ratelimit-remaining-requests': '0',
      'x-ratelimit-reset-requests': '8s',
    };
    const res = groqAdapter.parseRateLimit(headers);
    expect(res?.retryAfterMs).toBe(8000);
  });

  it('Azure parses retry-after-ms', () => {
    const headers = { 'retry-after-ms': '450' };
    const res = azureAdapter.parseRateLimit(headers);
    expect(res?.retryAfterMs).toBe(450);
  });

  it('Gemini classifies RESOURCE_EXHAUSTED errors', () => {
    const classification = geminiAdapter.classifyError?.({ status: 'RESOURCE_EXHAUSTED' });
    expect(classification?.retryable).toBe(true);
    expect(classification?.reason).toBe('quota_exhausted');
  });
});