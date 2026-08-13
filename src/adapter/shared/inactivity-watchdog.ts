/**
 * Inactivity watchdog for agent event loops.
 *
 * Fires when no event arrives within a configurable timeout window.
 * Timer resets on each bump() call. Used by claude-code and codex adapters
 * to detect hangs where the agent process is alive but the SDK emits nothing.
 *
 * Design D5/D6 (agent-inactivity-timeout): shared single-source implementation
 * for all four event-loop sites (claude-code main/follow-up/repair + codex executeTurn).
 */

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 900_000ms (15 minutes)

export interface InactivityWatchdog {
  /** Reset the inactivity timer. Call before each for-await loop and on each event arrival. No-op after fired. */
  bump(): void;
  /** Cancel the timer. Idempotent. Preserves fired state. */
  clear(): void;
  /** True after the timer has fired. */
  readonly fired: boolean;
  /** Milliseconds elapsed since the last bump when the timer fired. 0 before firing. */
  readonly elapsedMs: number;
}

/**
 * Create an inactivity watchdog.
 *
 * @param onFire - Called once when the timer fires (typically calls abortController.abort()).
 * @param timeoutMs - Inactivity threshold in ms. Defaults to DEFAULT_INACTIVITY_TIMEOUT_MS.
 * @param now - Clock source. Defaults to Date.now (vitest fake timers mock Date too).
 */
export function createInactivityWatchdog(
  onFire: () => void,
  timeoutMs: number = DEFAULT_INACTIVITY_TIMEOUT_MS,
  now: () => number = Date.now,
): InactivityWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let _fired = false;
  let _elapsedMs = 0;
  let lastActivityAt = now();

  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      _fired = true;
      _elapsedMs = now() - lastActivityAt;
      onFire();
    }, timeoutMs);
  };

  return {
    bump(): void {
      if (_fired) return; // no-op after fire (D5: post-fire bump must not re-arm)
      lastActivityAt = now();
      arm();
    },
    clear(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      // Preserve _fired so catch can still read watchdog.fired after finally clears.
    },
    get fired(): boolean {
      return _fired;
    },
    get elapsedMs(): number {
      return _elapsedMs;
    },
  };
}

/**
 * Build the error message for an inactivity timeout halt.
 * Single-source for both claude-code and codex adapters (D6).
 *
 * @param stepName - Name of the step that timed out.
 * @param elapsedMs - Measured ms since the last event (not the configured threshold).
 */
export function formatInactivityTimeoutMessage(stepName: string, elapsedMs: number): string {
  return `Step '${stepName}' inactivity timeout: no agent event for ${elapsedMs}ms`;
}
