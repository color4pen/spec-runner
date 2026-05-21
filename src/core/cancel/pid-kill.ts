/**
 * Graceful process kill utility for `job cancel`.
 *
 * D1: SIGTERM → poll → SIGKILL (configurable timeout)
 * D2: ESRCH (no such process) treated as already-dead success
 * D3: EPERM (permission denied) returns { killed: false, warning }
 * D4: All deps injected for testability
 */

export interface KillDeps {
  /** Wrapper around process.kill — injectable for tests. */
  kill: (pid: number, signal: string) => void;
  /** Async sleep — injectable for tests. */
  sleep: (ms: number) => Promise<void>;
  /** Returns true if pid is alive (process.kill(pid, 0) throws on dead). */
  isAlive: (pid: number) => boolean;
}

export interface KillResult {
  killed: boolean;
  warning?: string;
}

/**
 * Send SIGTERM to pid, poll until dead (or timeout), then escalate to SIGKILL.
 *
 * @param pid       - Target process ID
 * @param timeoutMs - Max milliseconds to wait after SIGTERM before SIGKILL
 * @param deps      - Injectable dependencies (kill / sleep / isAlive)
 */
export async function gracefulKill(
  pid: number,
  timeoutMs: number,
  deps: KillDeps,
): Promise<KillResult> {
  const { kill, sleep, isAlive } = deps;

  // Step 1: SIGTERM
  try {
    kill(pid, "SIGTERM");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      // Already dead — treat as success
      return { killed: true };
    }
    if (code === "EPERM") {
      return { killed: false, warning: `Cannot kill pid ${pid}: permission denied (EPERM)` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, warning: `Cannot kill pid ${pid}: ${msg}` };
  }

  // Step 2: Poll every 100ms until dead or timeout
  const interval = 100;
  let elapsed = 0;

  while (elapsed < timeoutMs) {
    await sleep(interval);
    elapsed += interval;

    let alive: boolean;
    try {
      alive = isAlive(pid);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return { killed: true };
      }
      // Any other error in isAlive — treat as dead (conservative)
      return { killed: true };
    }

    if (!alive) {
      return { killed: true };
    }
  }

  // Step 3: Timeout reached — escalate to SIGKILL
  try {
    kill(pid, "SIGKILL");
    return { killed: true };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      return { killed: true };
    }
    if (code === "EPERM") {
      return { killed: false, warning: `Cannot kill pid ${pid}: permission denied (EPERM)` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, warning: `Cannot kill pid ${pid}: ${msg}` };
  }
}
