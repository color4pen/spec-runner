/**
 * Unit tests for finish preflight — MERGED bypass, UNKNOWN retry, and checkout.
 *
 * TC-013: MERGED + mergeStateStatus UNKNOWN → bypass retry, return success immediately
 * TC-014: OPEN + mergeStateStatus UNKNOWN → retry logic runs (existing behavior)
 * TC-CHECKOUT-1: checkout 成功 → validate 成功 → restore 成功 → { ok: true }
 * TC-CHECKOUT-2: checkout 成功 → validate 失敗 → restore 実行 → escalation
 * TC-CHECKOUT-3: checkout 失敗 → escalation (validate 未実行、restore 不要)
 * TC-CHECKOUT-4: validate 成功 → restore 失敗 → warning 出力のみ、{ ok: true }
 */
import { describe, it, expect, vi } from "vitest";
import {
  fetchPrViewWithRetryForTest,
  pollMergeStateAfterPushForTest,
  runPreflight,
} from "../../../../src/core/finish/preflight.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { ResolvedTarget, FinishFs } from "../../../../src/core/finish/types.js";

// ---------------------------------------------------------------------------
// TC-013: MERGED PR with UNKNOWN mergeStateStatus → bypass retry, success
// ---------------------------------------------------------------------------

describe("TC-013: preflight MERGED bypass — MERGED + UNKNOWN → immediate success", () => {
  it("returns ok:true without retrying when state=MERGED and mergeStateStatus=UNKNOWN", async () => {
    const spawnCalls: number[] = [];

    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        spawnCalls.push(1);
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "MERGED",
            mergeStateStatus: "UNKNOWN",
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("MERGED");
    }
    // Should NOT have slept — bypass returns immediately
    expect(sleepFn).not.toHaveBeenCalled();
    // gh pr view called only once (no retry)
    expect(spawnCalls).toHaveLength(1);
  });

  it("returns the parsed MERGED PR data in the success result", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, _args: string[]) =>
      Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({
          state: "MERGED",
          mergeStateStatus: "UNKNOWN",
          headRefName: "feat/my-feature",
        }),
        stderr: "",
      }),
    );

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 99,
      cwd: "/tmp",
      spawn,
      slug: "my-feature",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.headRefName).toBe("feat/my-feature");
      expect(result.data.mergeStateStatus).toBe("UNKNOWN");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-014: OPEN PR with UNKNOWN mergeStateStatus → retry logic runs as before
// ---------------------------------------------------------------------------

describe("TC-014: preflight MERGED bypass — OPEN + UNKNOWN → retry logic runs", () => {
  it("retries when state=OPEN and mergeStateStatus=UNKNOWN (MERGED bypass does not fire)", async () => {
    let callCount = 0;

    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        callCount++;
        // First two calls: OPEN + UNKNOWN; third call: OPEN + CLEAN
        const mergeStateStatus = callCount < 3 ? "UNKNOWN" : "CLEAN";
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "OPEN",
            mergeStateStatus,
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe("OPEN");
      expect(result.data.mergeStateStatus).toBe("CLEAN");
    }
    // Should have slept at least once (retry fired)
    expect(sleepFn).toHaveBeenCalled();
    // Called more than once (retried)
    expect(callCount).toBeGreaterThan(1);
  });

  it("escalates after all retries exhausted for OPEN + UNKNOWN", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === "view") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({
            state: "OPEN",
            mergeStateStatus: "UNKNOWN",
            headRefName: "feat/test-slug",
          }),
          stderr: "",
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await fetchPrViewWithRetryForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test-slug",
      sleepFn,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("UNKNOWN");
    }
  });
});

// ---------------------------------------------------------------------------
// Checkout helpers — integration via runPreflight
// ---------------------------------------------------------------------------

/** Minimal FinishFs mock that reports change folder as existing by default. */
function makeFs(changeFolderExists = true): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(changeFolderExists),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_TARGET: ResolvedTarget = {
  jobId: "job-001",
  prNumber: 42,
  prUrl: "https://github.com/org/repo/pull/42",
  branch: "feat/test-slug",
  slug: "test-slug",
};

/**
 * TC-CHECKOUT-1: checkout 成功 → validate 成功 → restore 成功 → { ok: true }
 */
describe("TC-CHECKOUT-1: checkout success → validate success → restore success → ok:true", () => {
  it("returns ok:true and restores the original branch", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      // Check 7: which binaries
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/which", stderr: "" });
      // Check 3+4: gh pr view
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      // git rev-parse → current branch is "main"
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ exitCode: 0, stdout: "main\n", stderr: "" });
      }
      // git fetch origin feat/test-slug
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // git checkout feat/test-slug
      if (cmd === "git" && args[0] === "checkout") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // openspec validate → success
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // Check 8: git rev-list
      if (cmd === "git" && args[0] === "rev-list") {
        return Promise.resolve({ exitCode: 0, stdout: "0\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPreflight({
      target: BASE_TARGET,
      cwd: "/tmp",
      spawn,
      fs: makeFs(true),
      dryRun: false,
    });

    expect(result.ok).toBe(true);

    // Verify restore was called with "main"
    // mock.calls shape: [cmd: string, args: string[], opts: object]
    type SpawnCall = [string, string[], object];
    const mockCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls as SpawnCall[];
    const checkoutCalls = mockCalls.filter(
      (c) => c[0] === "git" && c[1][0] === "checkout",
    );
    // Should have checkout to feature branch AND checkout back to main
    const checkoutArgs = checkoutCalls.map((c) => c[1]);
    expect(checkoutArgs).toContainEqual(["checkout", "feat/test-slug"]);
    expect(checkoutArgs).toContainEqual(["checkout", "main"]);
  });
});

/**
 * TC-CHECKOUT-2: checkout 成功 → validate 失敗 → restore 実行 → escalation
 */
describe("TC-CHECKOUT-2: checkout success → validate fail → restore → escalation", () => {
  it("returns escalation and still restores the original branch", async () => {
    const checkoutCalls: string[] = [];

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ exitCode: 0, stdout: "main\n", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "checkout") {
        checkoutCalls.push(args[1] as string);
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "Unknown item 'test-slug'" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPreflight({
      target: BASE_TARGET,
      cwd: "/tmp",
      spawn,
      fs: makeFs(true),
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("check 6");
    }
    // Restore must have been called
    expect(checkoutCalls).toContain("main");
  });
});

/**
 * TC-CHECKOUT-3: checkout 失敗 → escalation (validate 未実行、restore 不要)
 */
describe("TC-CHECKOUT-3: checkout fail → escalation (no validate, no restore)", () => {
  it("escalates without calling openspec validate", async () => {
    let validateCalled = false;

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ exitCode: 0, stdout: "main\n", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      // All git checkout attempts fail
      if (cmd === "git" && args[0] === "checkout") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "error: pathspec not found" });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        validateCalled = true;
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPreflight({
      target: BASE_TARGET,
      cwd: "/tmp",
      spawn,
      fs: makeFs(true),
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("branch checkout");
    }
    expect(validateCalled).toBe(false);
  });
});

/**
 * TC-CHECKOUT-4: validate 成功 → restore 失敗 → warning のみ、{ ok: true }
 */
describe("TC-CHECKOUT-4: validate success → restore fail → warning only, ok:true", () => {
  it("returns ok:true even when restore fails, writing a warning to stderr", async () => {
    const stderrWrites: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = vi.fn().mockImplementation((msg: string) => {
      stderrWrites.push(msg);
      return true;
    });

    let checkoutCount = 0;

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ exitCode: 0, stdout: "main\n", stderr: "" });
      }
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "checkout") {
        checkoutCount++;
        // First checkout (to feature branch) succeeds; second (restore) fails
        if (checkoutCount === 1) {
          return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
        }
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "error: restore failed" });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "rev-list") {
        return Promise.resolve({ exitCode: 0, stdout: "0\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    try {
      const result = await runPreflight({
        target: BASE_TARGET,
        cwd: "/tmp",
        spawn,
        fs: makeFs(true),
        dryRun: false,
      });

      expect(result.ok).toBe(true);
      // A warning should have been written to stderr
      const hasWarning = stderrWrites.some((msg) => msg.toLowerCase().includes("warning"));
      expect(hasWarning).toBe(true);
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });
});

// ---------------------------------------------------------------------------
// worktreePath path — Check 5+6 runs in worktree, no checkout needed
// ---------------------------------------------------------------------------

const WORKTREE_TARGET: ResolvedTarget = {
  ...BASE_TARGET,
  worktreePath: "/repo/.git/specrunner-worktrees/test-slug-abcdef12",
};

/**
 * TC-WT-PRE-001: worktreePath set → no git checkout/restore, validate uses worktreePath as cwd
 */
describe("TC-WT-PRE-001: worktreePath set → no checkout, validate uses worktree cwd", () => {
  it("skips branch checkout and runs openspec validate in worktreePath", async () => {
    const spawnCalls: Array<{ cmd: string; args: string[]; cwd: string }> = [];

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[], opts: { cwd: string }) => {
      spawnCalls.push({ cmd, args: [...args], cwd: opts.cwd });
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "feat/test-slug" }),
          stderr: "",
        });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "rev-list") {
        return Promise.resolve({ exitCode: 0, stdout: "0\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPreflight({
      target: WORKTREE_TARGET,
      cwd: "/main-cwd",
      spawn,
      fs: makeFs(true),
      dryRun: false,
    });

    expect(result.ok).toBe(true);

    // No git checkout (no branch switching)
    const checkoutCalls = spawnCalls.filter((c) => c.cmd === "git" && c.args[0] === "checkout");
    expect(checkoutCalls).toHaveLength(0);

    // No git rev-parse (branch name lookup not needed)
    const revParseCalls = spawnCalls.filter((c) => c.cmd === "git" && c.args[0] === "rev-parse");
    expect(revParseCalls).toHaveLength(0);

    // openspec validate called in worktreePath
    const validateCalls = spawnCalls.filter((c) => c.cmd === "openspec" && c.args[0] === "validate");
    expect(validateCalls.length).toBeGreaterThan(0);
    expect(validateCalls[0]?.cwd).toBe(WORKTREE_TARGET.worktreePath);
  });
});

/**
 * TC-WT-PRE-002: worktreePath set + validate fails → escalation (no restore needed)
 */
describe("TC-WT-PRE-002: worktreePath set + validate fails → escalation", () => {
  it("returns escalation when openspec validate fails in worktree path", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/x", stderr: "" });
      if (cmd === "gh" && args[0] === "pr") {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ state: "OPEN", mergeStateStatus: "CLEAN" }),
          stderr: "",
        });
      }
      if (cmd === "openspec" && args[0] === "validate") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "validation error" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPreflight({
      target: WORKTREE_TARGET,
      cwd: "/main-cwd",
      spawn,
      fs: makeFs(true),
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.escalation).toContain("check 6");
    }
  });
});

// ---------------------------------------------------------------------------
// pollMergeStateAfterPush — post-push polling
// ---------------------------------------------------------------------------

describe("pollMergeStateAfterPush", () => {
  /**
   * TC-POST-PUSH-001: 1 回目で CLEAN → 即座に返す（retry なし）
   */
  it("TC-POST-PUSH-001: returns immediately when mergeStateStatus is CLEAN", async () => {
    const spawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ mergeStateStatus: "CLEAN" }),
      stderr: "",
    });
    const sleepFn = vi.fn();

    const result = await pollMergeStateAfterPushForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test",
      sleepFn,
    });

    expect(result.mergeStateStatus).toBe("CLEAN");
    expect(sleepFn).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  /**
   * TC-POST-PUSH-002: BEHIND → BEHIND → CLEAN（2 回 retry で成功）
   */
  it("TC-POST-PUSH-002: retries on non-CLEAN and succeeds when CLEAN", async () => {
    let call = 0;
    const spawn = vi.fn().mockImplementation(() => {
      call++;
      const status = call < 3 ? "BEHIND" : "CLEAN";
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({ mergeStateStatus: status }),
        stderr: "",
      });
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollMergeStateAfterPushForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test",
      sleepFn,
    });

    expect(result.mergeStateStatus).toBe("CLEAN");
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  /**
   * TC-POST-PUSH-003: 5 回全部 UNKNOWN → escalation せず空文字を返す
   */
  it("TC-POST-PUSH-003: returns empty string after exhausting retries (no escalation)", async () => {
    const spawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ mergeStateStatus: "UNKNOWN" }),
      stderr: "",
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollMergeStateAfterPushForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test",
      sleepFn,
    });

    expect(result.mergeStateStatus).toBe("");
    expect(spawn).toHaveBeenCalledTimes(5);
    expect(sleepFn).toHaveBeenCalledTimes(4); // sleep between attempts, not after last
  });

  /**
   * TC-POST-PUSH-004: DIRTY → 即座に打ち切り、retry なし
   */
  it("TC-POST-PUSH-004: returns DIRTY immediately without retrying", async () => {
    const spawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ mergeStateStatus: "DIRTY" }),
      stderr: "",
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollMergeStateAfterPushForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test",
      sleepFn,
    });

    expect(result.mergeStateStatus).toBe("DIRTY");
    // Polled exactly once — no retries for DIRTY
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  /**
   * TC-POST-PUSH-005: BEHIND → BEHIND → CLEAN（BEHIND は打ち切らない）
   */
  it("TC-POST-PUSH-005: BEHIND is not treated as DIRTY, retries until CLEAN", async () => {
    let call = 0;
    const spawn = vi.fn().mockImplementation(() => {
      call++;
      const status = call < 3 ? "BEHIND" : "CLEAN";
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({ mergeStateStatus: status }),
        stderr: "",
      });
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollMergeStateAfterPushForTest({
      prNumber: 42,
      cwd: "/tmp",
      spawn,
      slug: "test",
      sleepFn,
    });

    expect(result.mergeStateStatus).toBe("CLEAN");
    expect(call).toBe(3); // retried until CLEAN
  });
});
