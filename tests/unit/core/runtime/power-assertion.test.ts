/**
 * Unit tests for acquirePowerAssertion in src/core/runtime/power-assertion.ts.
 *
 * TC-PA-01: darwin — spawns caffeinate with correct args; release() kills handle.
 * TC-PA-02: non-darwin — no spawn; release() does not throw (no-op fail-open).
 * TC-PA-03: fail-open ENOENT — onError triggers warn; no throw; release() safe.
 */
import { describe, it, expect, vi } from "vitest";
import { acquirePowerAssertion } from "../../../../src/core/runtime/power-assertion.js";
import type { SpawnBackgroundFn, BackgroundProcessHandle } from "../../../../src/util/spawn.js";

// ─── TC-PA-01: darwin acquire ─────────────────────────────────────────────────

describe("TC-PA-01: acquirePowerAssertion on darwin spawns caffeinate with correct args", () => {
  it("spawns caffeinate -i -w <parentPid> and release() calls handle.kill()", () => {
    const killSpy = vi.fn();
    const fakeHandle: BackgroundProcessHandle = {
      pid: 1234,
      kill: killSpy,
    };

    const spawnCalls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
    const spawnBackgroundFn: SpawnBackgroundFn = (cmd, args, opts) => {
      spawnCalls.push({ cmd, args: [...args], cwd: opts.cwd });
      return fakeHandle;
    };

    const assertion = acquirePowerAssertion({
      cwd: "/w",
      parentPid: 4242,
      platform: "darwin",
      spawnBackgroundFn,
    });

    // spawn must have been called exactly once
    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0]!;
    expect(call.cmd).toBe("caffeinate");
    expect(call.args).toEqual(["-i", "-w", "4242"]);
    expect(call.cwd).toBe("/w");

    // release() must call handle.kill()
    assertion.release();
    expect(killSpy).toHaveBeenCalledOnce();
  });
});

// ─── TC-PA-02: non-darwin no-op ───────────────────────────────────────────────

describe("TC-PA-02: acquirePowerAssertion on non-darwin returns no-op without spawning", () => {
  it("does not call spawnBackgroundFn and release() does not throw", () => {
    const spawnBackgroundFn = vi.fn() as unknown as SpawnBackgroundFn;

    const assertion = acquirePowerAssertion({
      cwd: "/w",
      platform: "linux",
      spawnBackgroundFn,
    });

    // Must not have spawned anything
    expect(spawnBackgroundFn).not.toHaveBeenCalled();

    // release() must not throw
    expect(() => assertion.release()).not.toThrow();
  });

  it("win32 platform also returns no-op without spawning", () => {
    const spawnBackgroundFn = vi.fn() as unknown as SpawnBackgroundFn;

    const assertion = acquirePowerAssertion({
      cwd: "/w",
      platform: "win32",
      spawnBackgroundFn,
    });

    expect(spawnBackgroundFn).not.toHaveBeenCalled();
    expect(() => assertion.release()).not.toThrow();
  });
});

// ─── TC-PA-03: fail-open ENOENT ───────────────────────────────────────────────

describe("TC-PA-03: acquirePowerAssertion is fail-open when caffeinate is unavailable", () => {
  it("does not throw; warn is called; release() is safe after ENOENT", () => {
    const killSpy = vi.fn();
    const fakeHandle: BackgroundProcessHandle = {
      pid: undefined,
      kill: killSpy,
    };

    // spawnBackgroundFn that synchronously invokes onError (simulates ENOENT)
    const spawnBackgroundFn: SpawnBackgroundFn = (_cmd, _args, opts) => {
      opts.onError?.(new Error("spawn caffeinate ENOENT"));
      return fakeHandle;
    };

    const warnSpy = vi.fn();

    // Must not throw
    let assertion!: ReturnType<typeof acquirePowerAssertion>;
    expect(() => {
      assertion = acquirePowerAssertion({
        cwd: "/w",
        parentPid: 9999,
        platform: "darwin",
        spawnBackgroundFn,
        warn: warnSpy,
      });
    }).not.toThrow();

    // warn must have been called with a message mentioning caffeinate
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMessage = warnSpy.mock.calls[0]?.[0] as string;
    expect(warnMessage).toContain("caffeinate");
    expect(warnMessage).toContain("job will continue");

    // release() must be safe
    expect(() => assertion.release()).not.toThrow();
  });
});
