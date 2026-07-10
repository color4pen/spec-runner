/**
 * Module-level flag that tracks whether the signal handler (local.ts signalCleanup)
 * has fired in this process.
 *
 * When this flag is `true`, exit-guard handlers (`handleNoWorktreeExit`,
 * `handlePerJobExit`, `handleGlobalExit`) skip `appendInterruption` and
 * `store.persist` to avoid writing a duplicate interruption record.
 *
 * Signal handler is responsible — skip to avoid duplicate interruption record.
 *
 * Contract:
 * - Signal handlers that call `appendInterruption` MUST call `markSignalHandlerFired()`
 *   synchronously before any `await`, so the flag is set before beforeExit fires.
 * - The exit-guard retains its role as a backstop for non-signal process exits
 *   (e.g. unhandled promise rejection, Bun `process.exit()` without signal).
 *   When `isSignalHandlerFired()` returns false, the exit-guard proceeds normally.
 */

let signalHandlerFired = false;

/**
 * Mark that the signal handler has fired for this process.
 * Must be called synchronously before any `await` in the signal handler
 * to guarantee visibility before the `beforeExit` event fires.
 */
export function markSignalHandlerFired(): void {
  signalHandlerFired = true;
}

/**
 * Return true when the signal handler has already fired and written its
 * interruption record. Exit-guard handlers should skip their write when this is true.
 */
export function isSignalHandlerFired(): boolean {
  return signalHandlerFired;
}

/**
 * Reset the signal-handler-fired flag.
 * FOR TEST USE ONLY — resets module state between test cases.
 */
export function resetSignalHandlerFiredForTest(): void {
  signalHandlerFired = false;
}
