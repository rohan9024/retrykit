import { StreamRetryOptions } from './types.js';
import { computeBackoffDelay } from './backoff.js';

export class StreamDuplicatePreventionError extends Error {
  constructor(
    message = 'Stream dropped mid-transmission and cannot be safely retried without checkpoint cursor, risking duplicate chunks.'
  ) {
    super(message);
    this.name = 'StreamDuplicatePreventionError';
  }
}

export class StreamStallError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream heartbeat timed out: No chunk received within ${timeoutMs}ms.`);
    this.name = 'StreamStallError';
  }
}

function getChunkCursor(chunk: any, options: any): any {
  if (options?.getCheckpoint) return options.getCheckpoint(chunk);
  if (chunk && typeof chunk === 'object') {
    for (const key of ['cursor', 'id', 'offset', 'index', 'checkpoint', 'seq', 'sequence', 'key']) {
      if (chunk[key] !== undefined) return chunk[key];
    }
  }
  return undefined;
}

function toAsyncIterator<T>(streamObj: any): AsyncIterator<T> {
  if (!streamObj) {
    throw new TypeError('Source must be an AsyncIterable, ReadableStream, or a factory returning one.');
  }

  // Response object with .body
  if (streamObj.body) {
    return toAsyncIterator(streamObj.body);
  }

  // Object with .stream
  if (streamObj.stream && typeof streamObj.stream !== 'function') {
    return toAsyncIterator(streamObj.stream);
  }

  // Direct AsyncIterator ({ next: Function })
  if (typeof streamObj.next === 'function') {
    return streamObj;
  }

  // AsyncIterable ([Symbol.asyncIterator])
  if (typeof streamObj[Symbol.asyncIterator] === 'function') {
    return streamObj[Symbol.asyncIterator]();
  }

  // Sync Iterable ([Symbol.iterator])
  if (typeof streamObj[Symbol.iterator] === 'function') {
    const iter = streamObj[Symbol.iterator]();
    return {
      async next() {
        return iter.next();
      },
    };
  }

  // ReadableStream (getReader())
  if (typeof streamObj.getReader === 'function') {
    const reader = streamObj.getReader();
    return {
      async next() {
        return reader.read();
      },
    };
  }

  // Node.js stream.Readable ({ on, read })
  if (typeof streamObj.on === 'function') {
    const queue: any[] = [];
    let ended = false;
    let error: any = null;
    let notify: (() => void) | null = null;

    streamObj.on('data', (chunk: any) => {
      queue.push(chunk);
      if (notify) {
        notify();
        notify = null;
      }
    });
    streamObj.on('end', () => {
      ended = true;
      if (notify) {
        notify();
        notify = null;
      }
    });
    streamObj.on('error', (err: any) => {
      error = err;
      if (notify) {
        notify();
        notify = null;
      }
    });

    return {
      async next() {
        while (queue.length === 0 && !ended && !error) {
          await new Promise<void>((r) => { notify = r; });
        }
        if (queue.length > 0) {
          return { done: false, value: queue.shift() };
        }
        if (error) {
          throw error;
        }
        return { done: true, value: undefined };
      },
    };
  }

  // Plain Array
  if (Array.isArray(streamObj)) {
    let index = 0;
    return {
      async next() {
        if (index < streamObj.length) {
          return { done: false, value: streamObj[index++] };
        }
        return { done: true, value: undefined };
      },
    };
  }

  throw new TypeError('Source must be an AsyncIterable, ReadableStream, or a factory returning one.');
}

function extractStreamAndOptions(arg1: any, arg2?: any): {
  factory: (cursor?: any) => Promise<any> | any;
  options: any;
} {
  const options = typeof arg2 === 'object' && arg2 !== null ? { ...arg2 } : {};

  // Case 1: arg1 is a function
  if (typeof arg1 === 'function') {
    return {
      factory: arg1,
      options,
    };
  }

  // Case 2: arg1 is an object
  if (arg1 && typeof arg1 === 'object') {
    const isDirectStream =
      typeof arg1[Symbol.asyncIterator] === 'function' ||
      typeof arg1[Symbol.iterator] === 'function' ||
      typeof arg1.getReader === 'function' ||
      typeof arg1.next === 'function' ||
      Boolean(arg1.body && typeof arg1.body.getReader === 'function');

    if (!isDirectStream) {
      const streamFn =
        arg1.streamFactory ||
        arg1.stream ||
        arg1.factory ||
        arg1.createStream ||
        arg1.getStream ||
        arg1.producer ||
        arg1.source ||
        arg1.fn ||
        arg1.execute ||
        arg1.generator;

      if (typeof streamFn === 'function') {
        return {
          factory: streamFn,
          options: { ...arg1, ...options },
        };
      }

      if (streamFn && typeof streamFn === 'object') {
        return {
          factory: () => streamFn,
          options: { ...arg1, ...options },
        };
      }

      // Check for any functional producer on the object
      for (const [key, val] of Object.entries(arg1)) {
        if (
          typeof val === 'function' &&
          !['onChunk', 'onStall', 'onCheckpoint', 'shouldRetry', 'getCursor'].includes(key)
        ) {
          return {
            factory: val as (cursor?: any) => any,
            options: { ...arg1, ...options },
          };
        }
      }
    }

    return {
      factory: () => arg1,
      options: { ...options },
    };
  }

  throw new TypeError('Source must be an AsyncIterable, ReadableStream, or a factory returning one.');
}

export async function* retryStream<T>(
  arg1: any,
  arg2?: any
): AsyncGenerator<T, void, unknown> {
  const { factory, options } = extractStreamAndOptions(arg1, arg2);

  const maxRetries = options.maxRetries ?? 3;
  const chunkTimeoutMs = options.chunkTimeoutMs ?? 10000;

  const isCheckpointed =
    typeof options.getCheckpoint === 'function';

  let attempt = 0;
  let totalYielded = 0;
  let lastCheckpoint: any = options.initialCursor ?? undefined;
  const emittedCursors = new Set<any>();

  while (attempt <= maxRetries) {
    if (options.signal?.aborted) {
      throw new Error('Stream operation aborted.');
    }

    try {
      let rawStream: any;
      if (attempt === 0) {
        rawStream = await factory(lastCheckpoint);
      } else if (typeof options.resumeFrom === 'function') {
        rawStream = await options.resumeFrom(lastCheckpoint);
      } else if (typeof options.resume === 'function') {
        rawStream = await options.resume(lastCheckpoint);
      } else {
        rawStream = await factory(lastCheckpoint);
      }

      const iterator = toAsyncIterator<T>(rawStream);

      while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const watchdog = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new StreamStallError(chunkTimeoutMs));
          }, chunkTimeoutMs);
        });

        try {
          const result = await Promise.race([iterator.next(), watchdog]);
          clearTimeout(timer);

          if (result.done) {
            return;
          }

          const chunk = result.value;
          const cursor = getChunkCursor(chunk, options);

          if (cursor !== undefined) {
            // Deduplicate chunks on resumption
            if (emittedCursors.has(cursor)) {
              continue; // Skip chunk already emitted before drop
            }
            emittedCursors.add(cursor);
            lastCheckpoint = cursor;
            options.onCheckpoint?.(cursor);
          }

          totalYielded++;
          options.onChunk?.(chunk);
          yield chunk;
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      }
    } catch (err) {
      const isUncheckpointed = !isCheckpointed;

      // Fast-fail if uncheckpointed stream drops mid-sentence after emitting chunks
      if (totalYielded > 0 && isUncheckpointed) {
        throw new StreamDuplicatePreventionError();
      }

      attempt++;
      options.onStall?.(attempt);

      if (attempt > maxRetries) {
        throw err;
      }

      const delay = computeBackoffDelay(attempt, options.backoff);
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
