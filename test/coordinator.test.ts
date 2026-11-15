import { describe, expect, it } from 'vitest';
import { ProviderCoordinator } from '../src/coordinator.js';

describe('ProviderCoordinator Stress & Cooldown Re-checking', () => {
  it('manages 100 concurrent operations without exceeding capacity', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrentAttempts: 10 });
    let currentInFlight = 0;
    let maxObserved = 0;

    const task = async () => {
      await coordinator.acquireSlot();
      currentInFlight++;
      maxObserved = Math.max(maxObserved, currentInFlight);
      await new Promise((r) => setTimeout(r, 5));
      currentInFlight--;
      coordinator.releaseSlot();
    };

    await Promise.all(Array.from({ length: 100 }, () => task()));
    expect(maxObserved).toBeLessThanOrEqual(10);
    expect(coordinator.getInFlight()).toBe(0);
  });

  it('re-checks cooldown when waking up from queue', async () => {
    const coordinator = new ProviderCoordinator({ maxConcurrentAttempts: 1 });

    // Acquire the only slot
    await coordinator.acquireSlot();

    let queuedTaskFinishedAfterCooldown = false;
    const queuedTask = (async () => {
      await coordinator.acquireSlot();
      queuedTaskFinishedAfterCooldown = coordinator.getCooldownRemaining() === 0;
      coordinator.releaseSlot();
    })();

    // In-flight peer sets a 30ms cooldown
    coordinator.updateFromHeaders({ 'retry-after': '0.03' });
    coordinator.releaseSlot();

    await queuedTask;
    expect(queuedTaskFinishedAfterCooldown).toBe(true);
  });
});