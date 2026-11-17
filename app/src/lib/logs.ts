/**
 * Chunked log scanning for an RPC that caps eth_getLogs at 10,000 blocks and rate limits parallel calls.
 * The range maths and the runner are pure so they can be tested without a network.
 */

export const LOG_CHUNK = 10_000n;
export const LOG_PARALLEL = 3;

export type Range = { from: bigint; to: bigint };

/** Splits [from, to] (inclusive) into ranges of at most `size` blocks. Oldest first. */
export function splitRanges(from: bigint, to: bigint, size: bigint = LOG_CHUNK): Range[] {
  if (size < 1n) throw new Error("Chunk size must be at least 1 block.");
  if (to < from) return [];
  const out: Range[] = [];
  for (let start = from; start <= to; start += size) {
    const end = start + size - 1n;
    out.push({ from: start, to: end > to ? to : end });
  }
  return out;
}

/** Same ranges, newest first (used when scanning backwards from the head). */
export function splitRangesNewestFirst(from: bigint, to: bigint, size: bigint = LOG_CHUNK): Range[] {
  return splitRanges(from, to, size).reverse();
}

export type RetryOptions = { retries?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 5;
  const base = opts.baseDelayMs ?? 400;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || (e as Error).name === "AbortError") throw e;
      await sleep(base * 2 ** attempt);
      attempt++;
    }
  }
}

export type ScanOptions<T> = RetryOptions & {
  parallel?: number;
  /** Called with each finished range, in completion order. */
  onChunk?: (range: Range, items: T[]) => void;
};

/**
 * Runs `fetchRange` for every range with at most `parallel` calls in flight, each with retry.
 * Results come back in the order of `ranges`.
 */
export async function scanRanges<T>(ranges: readonly Range[], fetchRange: (r: Range) => Promise<T[]>, opts: ScanOptions<T> = {}): Promise<T[]> {
  const parallel = Math.max(1, opts.parallel ?? LOG_PARALLEL);
  const results: T[][] = new Array(ranges.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= ranges.length) return;
      const r = ranges[i] as Range;
      const items = await withRetry(() => fetchRange(r), opts);
      results[i] = items;
      opts.onChunk?.(r, items);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, ranges.length) }, worker));
  return results.flat();
}
