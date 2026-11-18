/**
 * SingleFlight Request Deduplication:
 * If multiple concurrent calls are made with identical inputs during a spike or retry,
 * only ONE request executes upstream. The rest share the exact same returned promise.
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<unknown>>();

  public async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  public get pendingCount(): number {
    return this.inFlight.size;
  }
}

export const globalSingleFlight = new SingleFlight();