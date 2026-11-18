/**
 * Ghost Key Pool: Auto-rotates API keys upon encountering rate limits (429)
 * or quota bottlenecks, putting exhausted keys in a temporary cooldown.
 */
export class KeyPool {
  private keys: string[] = [];
  private cooldowns: Map<string, number> = new Map();
  private currentIndex = 0;

  constructor(keys: string[]) {
    this.keys = [...new Set(keys.filter((k) => k && k.trim().length > 0))];
  }

  public hasKeys(): boolean {
    return this.keys.length > 0;
  }

  public getActiveKey(): string {
    if (this.keys.length === 0) {
      throw new Error('KeyPool is empty.');
    }

    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now >= cooldownUntil) {
        this.currentIndex = idx;
        return key;
      }
    }

    // All keys in cooldown: find the one recovering soonest
    let soonestKey = this.keys[0];
    let minWait = Infinity;

    for (const key of this.keys) {
      const cooldownUntil = this.cooldowns.get(key) || 0;
      const wait = cooldownUntil - now;
      if (wait < minWait) {
        minWait = wait;
        soonestKey = key;
      }
    }

    return soonestKey;
  }

  public markRateLimited(key: string, retryAfterMs = 60000): string {
    const cooldownUntil = Date.now() + Math.max(1000, retryAfterMs);
    this.cooldowns.set(key, cooldownUntil);

    // Rotate pointer to next key
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    return this.getActiveKey();
  }

  public markHealthy(key: string): void {
    this.cooldowns.delete(key);
  }

  public getCooldownRemainingMs(key: string): number {
    const until = this.cooldowns.get(key) || 0;
    return Math.max(0, until - Date.now());
  }
}