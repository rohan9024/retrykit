export interface ResilienceStateStore { get<T = unknown>(key: string): Promise<T | undefined>; set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>; delete(key: string): Promise<void>; }

export class UpstashRestStateStore implements ResilienceStateStore {
  constructor(private readonly url: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  private async command<T>(command: unknown[]): Promise<T | undefined> {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
    if (!response.ok) throw new Error(`Upstash request failed: HTTP ${response.status}`);
    const payload = await response.json() as { result?: T };
    return payload.result;
  }
  async get<T = unknown>(key: string): Promise<T | undefined> { const value = await this.command<string | null>(['GET', key]); return value == null ? undefined : JSON.parse(value) as T; }
  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> { const command = ['SET', key, JSON.stringify(value)]; if (ttlMs !== undefined) command.push('PX', String(ttlMs)); await this.command(command); }
  async delete(key: string): Promise<void> { await this.command(['DEL', key]); }
}
