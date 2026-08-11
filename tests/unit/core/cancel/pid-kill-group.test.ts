/**
 * Tests for gracefulKill group-kill extension (T-03).
 *
 * TC-006: leader pid escalation reaps the group (SIGKILL to -pid)
 * TC-007: non-leader pid escalation does NOT send group signal
 * TC-016: group signal EPERM does not flip `killed`
 *
 * These tests inject the new `isGroupLeader` dep into KillDeps and verify
 * that `KillResult.groupKilled` reflects the group-kill outcome.
 *
 * Tests are intentionally RED until the implementation adds:
 *   - `isGroupLeader: (pid: number) => boolean` to KillDeps
 *   - `groupKilled: boolean` to KillResult
 */
import { describe, it, expect, vi } from "vitest";
import { gracefulKill } from "../../../../src/core/cancel/pid-kill.js";
import type { KillDeps } from "../../../../src/core/cancel/pid-kill.js";

/** Build deps with always-true isAlive so SIGKILL escalation fires. */
function makeDepsAlwaysAlive(overrides: Partial<KillDeps> = {}): KillDeps {
  return {
    kill: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(true),
    // isGroupLeader defaults to false (non-leader) unless overridden
    isGroupLeader: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

function makeErrnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("gracefulKill — group reap on SIGKILL escalation", () => {
  // TC-006
  it("TC-006: leader pid — SIGKILL sent to both pid and group (-pid), groupKilled === true", async () => {
    const kill = vi.fn();
    const deps = makeDepsAlwaysAlive({
      kill,
      isGroupLeader: vi.fn().mockReturnValue(true),
    });

    const result = await gracefulKill(1234, 300, deps);

    expect(result.killed).toBe(true);
    // TC-006: SIGKILL must be sent to the group (-pid)
    expect(kill).toHaveBeenCalledWith(-1234, "SIGKILL");
    // TC-006: groupKilled reports the group signal was sent
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(true);
  });

  // TC-006: SIGKILL to pid itself must still be sent
  it("TC-006 (pid invariant): regular SIGKILL to pid is still sent on leader escalation", async () => {
    const kill = vi.fn();
    const deps = makeDepsAlwaysAlive({
      kill,
      isGroupLeader: vi.fn().mockReturnValue(true),
    });

    await gracefulKill(9999, 300, deps);

    expect(kill).toHaveBeenCalledWith(9999, "SIGKILL");
  });

  // TC-007
  it("TC-007: non-leader pid — no group (-pid) signal sent, groupKilled === false", async () => {
    const kill = vi.fn();
    const deps = makeDepsAlwaysAlive({
      kill,
      isGroupLeader: vi.fn().mockReturnValue(false),
    });

    const result = await gracefulKill(5678, 300, deps);

    expect(result.killed).toBe(true);
    // TC-007: no negative-pid call
    const negPidCalls = (kill.mock.calls as [number | string, string][]).filter(
      ([pid]) => typeof pid === "number" && pid < 0,
    );
    expect(negPidCalls).toHaveLength(0);
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(false);
  });

  // TC-016
  it("TC-016: group signal EPERM does not flip `killed`; groupKilled is false on EPERM", async () => {
    let killCallCount = 0;
    const kill = vi.fn().mockImplementation((pid: number, signal: string) => {
      killCallCount++;
      // 1st call: SIGTERM to pid (success)
      // 2nd call: SIGKILL to pid (success)
      // 3rd call: SIGKILL to -pid (group) → EPERM
      if (killCallCount === 3 && pid < 0 && signal === "SIGKILL") {
        throw makeErrnoError("EPERM");
      }
    });
    const deps = makeDepsAlwaysAlive({
      kill,
      isGroupLeader: vi.fn().mockReturnValue(true),
    });

    const result = await gracefulKill(7777, 300, deps);

    // TC-016: killed must remain true (pid kill succeeded; group error is best-effort)
    expect(result.killed).toBe(true);
    // TC-016: groupKilled must be false (EPERM on group signal)
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(false);
    // Warning must NOT contain EPERM from the group signal path
    // (the pid-level EPERM logic is separate)
  });

  // Regression: existing SIGTERM-immediate path unaffected when isGroupLeader is false
  it("existing: SIGTERM-immediate with isGroupLeader=false — no group kill, killed=true", async () => {
    const deps: KillDeps = {
      kill: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      isAlive: vi.fn().mockReturnValue(false), // dies immediately
      isGroupLeader: vi.fn().mockReturnValue(false),
    };

    const result = await gracefulKill(2222, 1000, deps);

    expect(result.killed).toBe(true);
    expect(deps.kill).toHaveBeenCalledWith(2222, "SIGTERM");
    expect(deps.kill).not.toHaveBeenCalledWith(expect.any(Number), "SIGKILL");
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(false);
  });

  // F-001 coverage: reapGroup is called on SIGTERM-poll death (isAlive=false), not only on
  // SIGKILL escalation. This is intentional: if the leader died during the SIGTERM poll
  // its group members may still be orphaned, so we attempt the group reap there too.
  it("leader dies during SIGTERM poll (isAlive=false) — group signal is sent, groupKilled=true", async () => {
    const kill = vi.fn();
    const deps: KillDeps = {
      kill,
      sleep: vi.fn().mockResolvedValue(undefined),
      isAlive: vi.fn().mockReturnValue(false), // dies after first poll, no SIGKILL escalation
      isGroupLeader: vi.fn().mockReturnValue(true),
    };

    const result = await gracefulKill(3333, 1000, deps);

    expect(result.killed).toBe(true);
    // SIGTERM sent; SIGKILL escalation must NOT fire (pid died in poll)
    expect(kill).toHaveBeenCalledWith(3333, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(3333, "SIGKILL");
    // Group reap fires even on SIGTERM-poll death for a leader
    expect(kill).toHaveBeenCalledWith(-3333, "SIGKILL");
    expect((result as { groupKilled?: boolean }).groupKilled).toBe(true);
  });
});
