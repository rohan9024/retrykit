import { describe, expect, it, vi } from 'vitest';
import { classifyFailure } from '../src/policy/classify.js';
import { ProviderCoordinator } from '../src/coordinator.js';
import { retryStream } from '../src/stream.js';
import { createChaosFetch } from '../src/testing/chaos.js';

describe('v3 release hardening', () => {
  it('classifies Anthropic spend-limit details and honors x-should-retry=false', () => {
    const result = classifyFailure({
      status: 429,
      headers: { 'x-should-retry': 'false' },
      error: { details: { error_code: 'enforced_spend_limit_reached' } },
    }, { provider: 'anthropic' });
    expect(result.category).toBe('billing_exhausted');
    expect(result.retrySameKey).toBe(false);
    expect(result.allowKeyRotation).toBe(true);
  });

  it('requires a checkpoint extractor before accepting initialCheckpoint', async () => {
    await expect((async () => {
      for await (const _chunk of retryStream(async function* () { yield { id: 1 }; }, { initialCheckpoint: 1 })) { /* consume */ }
    })()).rejects.toThrow('requires getCheckpoint');
  });

  it('does not oversubscribe during a shared cooldown', async () => {
    let now = 0;
    let wake!: () => void;
    const coordinator = new ProviderCoordinator({ capacity: 1, now: () => now, sleep: () => new Promise<void>((resolve) => { wake = resolve; }) });
    await coordinator.acquireSlot();
    coordinator.setCooldown(100);
    const pending = coordinator.acquireSlot();
    coordinator.releaseSlot();
    expect(coordinator.getInFlight()).toBe(0);
    now = 101;
    wake();
    await pending;
    expect(coordinator.getInFlight()).toBe(1);
    coordinator.releaseSlot();
  });

  it('produces a real partial stream drop in Fault Lab', async () => {
    const response = await createChaosFetch({ scenario: 'mid-stream-drop' })('https://example.test');
    expect(response.body).toBeTruthy();
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('chunk-1');
    await expect(reader.read()).rejects.toThrow('mid-stream connection dropped');
  });
});
