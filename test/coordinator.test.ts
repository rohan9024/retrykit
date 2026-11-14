import { describe, expect, it } from 'vitest';
import { ProviderCoordinator } from '../src/coordinator.js';

describe('ProviderCoordinator Shared Cooldown', () => {
  it('pauses queued requests during active provider cooldown', async () => {
    const coordinator = new ProviderCoordinator(5, 'test-provider');

    // Trigger 50ms cooldown
    coordinator.updateFromHeaders({ 'retry-after': '0.05' });
    expect(coordinator.getCooldownRemaining()).toBeGreaterThan(0);

    const start = Date.now();
    await coordinator.schedule(async () => 'completed');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('limits concurrent in-flight requests', async () => {
    const coordinator = new ProviderCoordinator(2);
    let maxObservedInFlight = 0;

    const task = async () => {
      maxObservedInFlight = Math.max(maxObservedInFlight, coordinator.getInFlight());
      await new Promise((r) => setTimeout(r, 20));
    };

    await Promise.all([
      coordinator.schedule(task),
      coordinator.schedule(task),
      coordinator.schedule(task),
      coordinator.schedule(task),
    ]);

    expect(maxObservedInFlight).toBeLessThanOrEqual(2);
  });
});