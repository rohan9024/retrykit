export interface ResilienceStateStore { get<T = unknown>(key: string): Promise<T | undefined>; set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>; delete(key: string): Promise<void>; }

export class UpstashRestStateStore implements ResilienceStateStore {
  constructor(private readonly url: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  private async command<T>(command: unknown[]): Promise<T | undefined> {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
    if (!response.ok) throw new Error(`Upstash request failed: HTTP ${response.status}`);
    const payload = await response.json() as { result?: T };
    return payload.result;
  }
  private async pipeline<T = unknown>(commands: unknown[][]): Promise<T[]> {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(commands) });
    if (!response.ok) throw new Error(`Upstash pipeline failed: HTTP ${response.status}`);
    return (await response.json() as Array<{ result: T }>).map((item) => item.result);
  }
  async get<T = unknown>(key: string): Promise<T | undefined> { const value = await this.command<string | null>(['GET', key]); return value == null ? undefined : JSON.parse(value) as T; }
  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> { const command = ['SET', key, JSON.stringify(value)]; if (ttlMs !== undefined) command.push('PX', String(ttlMs)); await this.command(command); }
  async delete(key: string): Promise<void> { await this.command(['DEL', key]); }
  /** Atomically increments a distributed counter and applies its expiry in one REST pipeline. */
  async increment(key: string, amount = 1, ttlMs?: number): Promise<number> {
    const commands: unknown[][] = [['INCRBY', key, amount]];
    if (ttlMs !== undefined) commands.push(['PEXPIRE', key, ttlMs]);
    const results = await this.pipeline<number>(commands);
    return Number(results[0]);
  }
  async consumeBudget(key: string, amount = 1, ttlMs?: number): Promise<number> { return this.increment(key, amount, ttlMs); }
}
