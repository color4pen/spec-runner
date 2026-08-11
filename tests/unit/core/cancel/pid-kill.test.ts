/**
 * Tests for gracefulKill utility.
 *
 * - SIGTERM で即終了するケース
 * - SIGTERM 後 polling で終了を検出するケース
 * - timeout → SIGKILL にフォールバックするケース
 * - pid が存在しない (ESRCH) ケース
 * - EPERM で kill 失敗するケース
 */
import { describe, it, expect, vi } from "vitest";
import { gracefulKill } from "../../../../src/core/cancel/pid-kill.js";
import type { KillDeps } from "../../../../src/core/cancel/pid-kill.js";

/** Build a minimal KillDeps stub. */
function makeDeps(overrides: Partial<KillDeps> = {}): KillDeps {
  return {
    kill: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

/** Create a NodeJS.ErrnoException-like error. */
function makeErrnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("gracefulKill", () => {
  it("returns { killed: true } when process dies immediately after SIGTERM", async () => {
    // isAlive returns false on first poll → dead
    const deps = makeDeps({ isAlive: vi.fn().mockReturnValue(false) });
    const result = await gracefulKill(1234, 1000, deps);

    expect(result.killed).toBe(true);
    expect(result.warning).toBeUndefined();

    // SIGTERM was sent
    expect(deps.kill).toHaveBeenCalledWith(1234, "SIGTERM");
    // SIGKILL was NOT sent
    expect(deps.kill).not.toHaveBeenCalledWith(1234, "SIGKILL");
  });

  it("returns { killed: true } when process dies after a few polls", async () => {
    let callCount = 0;
    const isAlive = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount < 3; // alive for 2 polls, dead on 3rd
    });
    const deps = makeDeps({ isAlive });

    const result = await gracefulKill(5678, 5000, deps);

    expect(result.killed).toBe(true);
    expect(isAlive).toHaveBeenCalledTimes(3);
    // SIGKILL was NOT needed
    expect(deps.kill).not.toHaveBeenCalledWith(5678, "SIGKILL");
  });

  it("falls back to SIGKILL after timeout when process stays alive", async () => {
    // isAlive always returns true → triggers SIGKILL after timeout
    const isAlive = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ isAlive });

    // timeout = 300ms with 100ms intervals → 3 polls
    const result = await gracefulKill(9999, 300, deps);

    expect(result.killed).toBe(true);
    // SIGTERM sent first, then SIGKILL
    expect(deps.kill).toHaveBeenNthCalledWith(1, 9999, "SIGTERM");
    expect(deps.kill).toHaveBeenNthCalledWith(2, 9999, "SIGKILL");
  });

  it("returns { killed: true } when SIGTERM throws ESRCH (process already dead)", async () => {
    const kill = vi.fn().mockImplementation(() => { throw makeErrnoError("ESRCH"); });
    const deps = makeDeps({ kill });

    const result = await gracefulKill(1111, 1000, deps);

    expect(result.killed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("returns { killed: false, warning } when SIGTERM throws EPERM", async () => {
    const kill = vi.fn().mockImplementation(() => { throw makeErrnoError("EPERM"); });
    const deps = makeDeps({ kill });

    const result = await gracefulKill(2222, 1000, deps);

    expect(result.killed).toBe(false);
    expect(result.warning).toMatch(/EPERM/);
  });

  it("returns { killed: true } when isAlive throws ESRCH during polling", async () => {
    const isAlive = vi.fn().mockImplementation(() => { throw makeErrnoError("ESRCH"); });
    const deps = makeDeps({ isAlive });

    const result = await gracefulKill(3333, 1000, deps);

    expect(result.killed).toBe(true);
  });

  it("returns { killed: true } when SIGKILL throws ESRCH (process died between polls)", async () => {
    // isAlive stays true (so we reach timeout), but SIGKILL throws ESRCH
    const isAlive = vi.fn().mockReturnValue(true);
    let killCallCount = 0;
    const kill = vi.fn().mockImplementation(() => {
      killCallCount++;
      if (killCallCount === 2) {
        // SIGKILL call
        throw makeErrnoError("ESRCH");
      }
      // SIGTERM call: succeeds
    });
    const deps = makeDeps({ kill, isAlive });

    const result = await gracefulKill(4444, 100, deps);

    expect(result.killed).toBe(true);
  });

  it("returns { killed: false, warning } when SIGKILL throws EPERM", async () => {
    const isAlive = vi.fn().mockReturnValue(true);
    let killCallCount = 0;
    const kill = vi.fn().mockImplementation(() => {
      killCallCount++;
      if (killCallCount === 2) {
        throw makeErrnoError("EPERM");
      }
    });
    const deps = makeDeps({ kill, isAlive });

    const result = await gracefulKill(5555, 100, deps);

    expect(result.killed).toBe(false);
    expect(result.warning).toMatch(/EPERM/);
  });

  // F-001: pin group-reap behaviour on the SIGTERM poll-death path (isAlive=false / ESRCH).
  // reapGroup is called on all observed-death paths, not only SIGKILL escalation.

  it("poll-death + leader: group SIGKILL sent when pid dies during SIGTERM poll (isAlive=false)", async () => {
    const kill = vi.fn();
    const deps = makeDeps({
      kill,
      isAlive: vi.fn().mockReturnValue(false), // dies immediately after SIGTERM, no escalation
      isGroupLeader: vi.fn().mockReturnValue(true),
    });

    const result = await gracefulKill(6666, 1000, deps);

    expect(result.killed).toBe(true);
    // SIGTERM sent; SIGKILL escalation must NOT fire
    expect(kill).toHaveBeenCalledWith(6666, "SIGTERM");
    expect(kill).not.toHaveBeenCalledWith(6666, "SIGKILL");
    // group SIGKILL must be sent on the poll-death path for a leader
    expect(kill).toHaveBeenCalledWith(-6666, "SIGKILL");
    expect(result.groupKilled).toBe(true);
  });

  it("poll-death + non-leader: no group signal when pid dies during SIGTERM poll (isAlive=false)", async () => {
    const kill = vi.fn();
    const deps = makeDeps({
      kill,
      isAlive: vi.fn().mockReturnValue(false),
      isGroupLeader: vi.fn().mockReturnValue(false),
    });

    const result = await gracefulKill(7777, 1000, deps);

    expect(result.killed).toBe(true);
    // no negative-pid call at all
    const negCalls = (kill.mock.calls as [number, string][]).filter(([p]) => p < 0);
    expect(negCalls).toHaveLength(0);
    expect(result.groupKilled).toBe(false);
  });
});
