/**
 * Generic exponential backoff retry helper.
 *
 * Supports both throw-based and return-value-based transient detection,
 * making it suitable for APIs that return error results rather than throwing.
 *
 * Delay formula: `baseDelayMs * 2^(retryAttempt - 1)`
 *   - 1st retry: baseDelayMs × 1  (e.g. 1 s)
 *   - 2nd retry: baseDelayMs × 2  (e.g. 2 s)
 *   - 3rd retry: baseDelayMs × 4  (e.g. 4 s)
 */

export interface RetryOptions<T> {
  /** Determine if a thrown error is transient (should be retried). */
  isTransientError?: (err: unknown) => boolean;
  /** Determine if a successful return value represents a transient failure (should be retried). */
  shouldRetryResult?: (result: T) => boolean;
  /** Total number of attempts including the first. Default: 4 */
  maxAttempts?: number;
  /** Base delay in ms for the first retry. Subsequent retries double. Default: 1000 */
  baseDelayMs?: number;
  /** Injectable sleep function for testing. Default: setTimeout-based */
  sleepFn?: (ms: number) => Promise<void>;
  /**
   * Called before each retry sleep.
   * @param attempt - Retry attempt number (1 = first retry, 2 = second, …)
   * @param info    - The error or result that triggered the retry
   */
  onRetry?: (attempt: number, info: { err?: unknown; result?: T }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry `fn` with exponential backoff.
 *
 * - If `fn` throws and `isTransientError(err)` is true  → retry
 * - If `fn` returns and `shouldRetryResult(result)` is true → retry
 * - Otherwise → return/re-throw immediately
 *
 * When exhausted:
 *   - shouldRetryResult path: returns last result (does not throw)
 *   - isTransientError path: re-throws last error
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions<T> = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const sleepFn = opts.sleepFn ?? defaultSleep;

  for (let run = 1; run <= maxAttempts; run++) {
    let threw = false;
    let caughtErr: unknown;
    let result!: T;

    try {
      result = await fn();
    } catch (err) {
      threw = true;
      caughtErr = err;
    }

    if (!threw) {
      // fn() returned — check if result signals a transient failure
      if (!opts.shouldRetryResult || !opts.shouldRetryResult(result)) {
        return result;
      }

      // Transient result — retry if attempts remain
      if (run < maxAttempts) {
        const retryAttempt = run;
        opts.onRetry?.(retryAttempt, { result });
        await sleepFn(baseDelayMs * Math.pow(2, retryAttempt - 1));
        continue;
      }

      // Exhausted — return last result (do not throw)
      return result;
    } else {
      // fn() threw — check if error is transient
      if (!opts.isTransientError || !opts.isTransientError(caughtErr)) {
        throw caughtErr;
      }

      // Transient error — retry if attempts remain
      if (run < maxAttempts) {
        const retryAttempt = run;
        opts.onRetry?.(retryAttempt, { err: caughtErr });
        await sleepFn(baseDelayMs * Math.pow(2, retryAttempt - 1));
        continue;
      }

      // Exhausted — re-throw last error
      throw caughtErr;
    }
  }

  /* c8 ignore next */
  throw new Error("retryWithBackoff: unreachable");
}
