import { describe, expect, it } from 'vitest';
import { findProviderAdapter, geminiAdapter } from '../src/adapters.js';

describe('Provider Adapters Granular Classification & Security', () => {
  it('classifies Gemini billing and quota errors distinctly', () => {
    const billingErr = new Error('Your project has exceeded its spending cap or billing is inactive.');
    const billingDecision = geminiAdapter.classifyError?.(billingErr);
    expect(billingDecision?.retryable).toBe(false);
    expect(billingDecision?.category).toBe('billing_limit');

    const dailyErr = new Error('Daily limit reached for models/gemini-1.5-pro');
    const dailyDecision = geminiAdapter.classifyError?.(dailyErr);
    expect(dailyDecision?.retryable).toBe(false);
    expect(dailyDecision?.category).toBe('quota_exhausted');

    const rateErr = new Error('Resource has been exhausted (e.g. check quota): RESOURCE_EXHAUSTED');
    const rateDecision = geminiAdapter.classifyError?.(rateErr);
    expect(rateDecision?.retryable).toBe(true);
    expect(rateDecision?.category).toBe('rate_limit');
  });

  it('verifies strict domain-boundary matching', () => {
    expect(findProviderAdapter('https://api.openai.com.attacker.com').name).toBe('generic');
    expect(findProviderAdapter('https://api.openai.com/v1').name).toBe('openai');
  });
});