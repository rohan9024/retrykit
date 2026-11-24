export type FaultScenario = '429' | '529' | '503' | 'insufficient_quota' | 'mid-stream-drop' | 'network-reset';
export interface ChaosOptions { scenario: FaultScenario; failures?: number; status?: number; body?: unknown; }

export function createChaosFetch(options: ChaosOptions): typeof fetch {
  let calls = 0;
  return (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    calls++;
    if (calls <= (options.failures ?? 1)) {
      if (options.scenario === 'network-reset') throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
      const status = options.status ?? (options.scenario === '529' ? 529 : options.scenario === '503' ? 503 : 429);
      return new Response(JSON.stringify(options.body ?? { error: { code: options.scenario } }), { status, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(options.body ?? { ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

export function runFaultEval(handler: (fetchImpl: typeof fetch) => Promise<unknown>, scenarios: FaultScenario[] = ['429', '529', '503', 'insufficient_quota', 'network-reset']) {
  return Promise.all(scenarios.map(async (scenario) => { try { await handler(createChaosFetch({ scenario })); return { scenario, passed: true }; } catch (error) { return { scenario, passed: false, error: String(error) }; } }));
}
