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
  /**
   * Returns true when `pid` is a process-group leader.
   *
   * D3 (design.md): production probe is `kill(-pid, 0)` — succeeds iff the group
   * whose PGID == pid exists, which for a live pid means pid is its own group leader.
   * Detached children are always group leaders (POSIX: pgid == pid).
   * Foreground jobs belong to the shell's group — group pid does not exist → false.
   *
   * Optional (defaults to () => false) so callers that don't wire it never group-signal.
   */
  isGroupLeader?: (pid: number) => boolean;
}

export interface KillResult {
  killed: boolean;
  /** Set to true when SIGKILL escalation also sent SIGKILL to the process group (-pid). */
  groupKilled: boolean;
  warning?: string;
}

/**
 * Best-effort: if pid is a group leader, SIGKILL the process group.
 * Returns true iff the group signal was sent (EPERM/ESRCH absorbed).
 */
function reapGroup(
  pid: number,
  kill: (pid: number, signal: string) => void,
  isGroupLeader: (pid: number) => boolean,
): boolean {
  try {
    if (!isGroupLeader(pid)) return false;
    try {
      kill(-pid, "SIGKILL");
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
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
  const { kill, sleep, isAlive, isGroupLeader = () => false } = deps;

  // Step 1: SIGTERM
  try {
    kill(pid, "SIGTERM");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      // Already dead — treat as success
      return { killed: true, groupKilled: false };
    }
    if (code === "EPERM") {
      return { killed: false, groupKilled: false, warning: `Cannot kill pid ${pid}: permission denied (EPERM)` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { killed: false, groupKilled: false, warning: `Cannot kill pid ${pid}: ${msg}` };
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
        return { killed: true, groupKilled: reapGroup(pid, kill, isGroupLeader) };
      }
      // Any other error in isAlive — treat as dead (conservative)
      return { killed: true, groupKilled: false };
    }

    if (!alive) {
      return { killed: true, groupKilled: reapGroup(pid, kill, isGroupLeader) };
    }
  }

  // Step 3: Timeout reached — escalate to SIGKILL
  // D3 (design.md): on SIGKILL escalation, also signal the process group when pid is a
  // group leader. Group-signal errors (EPERM/ESRCH) are best-effort and MUST NOT flip `killed`.
  let pidKillResult: KillResult;
  try {
    kill(pid, "SIGKILL");
    pidKillResult = { killed: true, groupKilled: false };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      pidKillResult = { killed: true, groupKilled: false };
    } else if (code === "EPERM") {
      return { killed: false, groupKilled: false, warning: `Cannot kill pid ${pid}: permission denied (EPERM)` };
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      return { killed: false, groupKilled: false, warning: `Cannot kill pid ${pid}: ${msg}` };
    }
  }

  // Group reap (POSIX only): leader detection probe then group SIGKILL — best-effort.
  // D3: only when isGroupLeader returns true (clean positive probe); never for foreground jobs.
  let groupKilled = false;
  try {
    if (isGroupLeader(pid)) {
      try {
        kill(-pid, "SIGKILL");
        groupKilled = true;
      } catch {
        // EPERM / ESRCH on group signal → best-effort, do not flip killed
      }
    }
  } catch {
    // isGroupLeader threw → treat as non-leader (conservative)
  }

  return { ...pidKillResult, groupKilled };
}
