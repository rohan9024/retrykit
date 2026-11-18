import { BackoffOptions, JitterType } from './types.js';

export const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  strategy: 'exponential',
  initialMs: 500,
  maxMs: 30000,
  factor: 2,
  jitter: 'full',
};

export function calculateRawDelay(attempt: number, options: Required<BackoffOptions>): number {
  const { strategy, initialMs, maxMs, factor } = options;

  let delay: number;
  switch (strategy) {
    case 'fixed':
      delay = initialMs;
      break;
    case 'linear':
      delay = initialMs * attempt;
      break;
    case 'exponential':
    default:
      delay = initialMs * Math.pow(factor, Math.max(0, attempt - 1));
      break;
  }

  return Math.min(delay, maxMs);
}

export function applyJitter(delay: number, jitter: JitterType, previousSleep = 0): number {
  switch (jitter) {
    case 'none':
      return delay;
    case 'equal':
      return Math.floor(delay / 2 + Math.random() * (delay / 2));
    case 'decorrelated':
      return Math.floor(Math.random() * (previousSleep * 3 - delay) + delay);
    case 'full':
    default:
      return Math.floor(Math.random() * delay);
  }
}

export function computeBackoffDelay(
  attempt: number,
  userOptions?: BackoffOptions,
  providerWaitMs?: number
): number {
  if (typeof providerWaitMs === 'number' && providerWaitMs > 0) {
    return providerWaitMs + Math.floor(Math.random() * 50);
  }

  const opts: Required<BackoffOptions> = { ...DEFAULT_BACKOFF, ...userOptions };
  const raw = calculateRawDelay(attempt, opts);
  return applyJitter(raw, opts.jitter);
}