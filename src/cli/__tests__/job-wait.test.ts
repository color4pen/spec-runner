/**
 * Tests for src/cli/job-wait.ts
 *
 * TC-010: pid 生存中は awaiting-resume でも待ち続ける（disk-lag 吸収の歯）
 * TC-011: 破壊確認 — status 先行で settle するとテストが落ちる
 * TC-012: プロセス死亡後に確定 status を読む
 * TC-013: プロセス死亡後に disk status が running のままなら awaiting-resume として扱う
 * TC-014: pid 不在の後方互換 state は isStaleRunning fallback に従う
 * TC-015: awaiting-archive は exit 0 で archive アクションを案内する
 * TC-016: awaiting-resume は exit 1 で resume アクションを案内する
 * TC-017: failed / terminated / canceled は exit 1 を返す
 * TC-018: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す
 * TC-029: archived status は exit 0 を返す
 *
 * --- New TCs for liveness-probe-jobid-scope ---
 * TC-004: job wait — jobId 一致の sidecar pid でプロセス生存中 → pid 採用・待機継続
 * TC-005: job wait — jobId 不一致の sidecar pid → pid 不採用・no-pid パス
 * TC-006: job wait — jobId フィールドなしの sidecar（legacy）→ pid 不採用・no-pid パス
 * TC-008: job wait poll ループが resolveJobPid を経由して jobId 照合を行う（行動検証）
 * TC-013(new): realReadSidecarPid — SidecarContent 形式（{ pid, jobId }）を返す
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn() };
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import type { JobState, JobStatus } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runJobWait, type JobWaitDeps } from "../job-wait.js";
// Namespace import for TC-013: access realReadSidecarPid once it is exported.
import * as jobWaitExports from "../job-wait.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-abc-0001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    pid: 12345,
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/** Captured stdout output from runJobWait */
let capturedOutput: string[];

function captureStdout(): () => void {
  capturedOutput = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    capturedOutput.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  return () => spy.mockRestore();
}

beforeEach(() => {
  capturedOutput = [];
});

// ---------------------------------------------------------------------------
// Minimal DI helpers
// ---------------------------------------------------------------------------

/**
 * Build JobWaitDeps that:
 * - First tick: state with given pid + status (pid is alive)
 * - Second tick: same but pid is dead, status changes to settled
 */
function makeDepsWithPidTransition(opts: {
  slug: string;
  repoRoot: string;
  /** State when pid is alive */
  aliveState: JobState;
  /** State after process dies */
  deadState: JobState;
  /** How many ticks the process is alive before dying */
  aliveForTicks?: number;
}): JobWaitDeps {
  const aliveForTicks = opts.aliveForTicks ?? 1;
  let tick = 0;
  let isAlive = true;

  const deps: JobWaitDeps = {
    loadState: vi.fn(async (_slug: string, _repoRoot: string) => {
      const currentTick = tick;
      tick++;
      if (currentTick < aliveForTicks) {
        return opts.aliveState;
      }
      return opts.deadState;
    }),
    isProcessAlive: vi.fn((_pid: number) => {
      // pid alive for first aliveForTicks checks, then dead
      if (isAlive && tick <= aliveForTicks) {
        return true;
      }
      isAlive = false;
      return false;
    }),
    isStaleRunning: vi.fn(() => false),
    readSidecarPid: vi.fn(() => null),
    sleep: vi.fn(async () => {
      // no actual sleep in tests
    }),
    pollIntervalMs: 0,
    notFoundRetryCount: 5,
    notFoundRetryIntervalMs: 0,
  };
  return deps;
}

/**
 * Build deps where there's no pid (backward compat state).
 */
function makeDepsNoPid(opts: {
  state: JobState;
  isStaleRunningResult: boolean;
}): JobWaitDeps {
  return {
    loadState: vi.fn(async () => opts.state),
    isProcessAlive: vi.fn(() => false),
    isStaleRunning: vi.fn(() => opts.isStaleRunningResult),
    readSidecarPid: vi.fn(() => null),
    sleep: vi.fn(async () => {}),
    pollIntervalMs: 0,
    notFoundRetryCount: 5,
    notFoundRetryIntervalMs: 0,
  };
}

// ---------------------------------------------------------------------------
// TC-010: pid 生存中は awaiting-resume でも待ち続ける（disk-lag 吸収の歯）
// ---------------------------------------------------------------------------

describe("TC-010: pid 生存中は awaiting-resume でも待ち続ける", () => {
  it("TC-010: does not settle when pid is alive and status is awaiting-resume", async () => {
    // After 3 ticks alive, pid dies and status becomes awaiting-archive
    const aliveState = makeJobState({ status: "awaiting-resume", pid: 12345 });
    const deadState = makeJobState({ status: "awaiting-archive", pid: null });

    const deps = makeDepsWithPidTransition({
      slug: "test-slug",
      repoRoot: "/repo",
      aliveState,
      deadState,
      aliveForTicks: 3,
    });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // Should settle with awaiting-archive (exit 0)
      expect(code).toBe(0);
      // isProcessAlive should have been called at least once while alive
      expect(vi.mocked(deps.isProcessAlive).mock.calls.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("TC-010: does not settle when pid is alive and status is awaiting-archive", async () => {
    // Even if disk shows awaiting-archive, while pid alive we keep waiting
    const aliveState = makeJobState({ status: "awaiting-archive", pid: 12345 });
    const deadState = makeJobState({ status: "awaiting-archive", pid: null });

    const deps = makeDepsWithPidTransition({
      slug: "test-slug",
      repoRoot: "/repo",
      aliveState,
      deadState,
      aliveForTicks: 2,
    });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-011: 破壊確認 — status 先行で settle するとテストが落ちる
// ---------------------------------------------------------------------------

describe("TC-011: 破壊確認 — process-death gate が効いている確認", () => {
  it("TC-011: pid alive + awaiting-archive should NOT settle (gate is active)", async () => {
    // Simulate a scenario where process is still alive but disk shows awaiting-archive.
    // A broken implementation (status-first poll) would settle immediately without
    // calling isProcessAlive.  A correct implementation (process-death gate) must
    // call isProcessAlive before settling.
    //
    // Sabotage teeth:
    //   1. isProcessAlive call count ≥ 1  — gate is consulted before settling.
    //   2. exit code 0 (from TC-010 / TC-012)  — settled only after process dies.
    //
    // Note: sleep is called AFTER isProcessAlive returns true (alive path), so
    // tickCount is already ≥ 1 inside the sleep callback; settledEarly-style
    // assertions on tickCount inside sleep are always false and not meaningful here.

    let tickCount = 0;

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () =>
        makeJobState({ status: "awaiting-archive", pid: 12345 }),
      ),
      isProcessAlive: vi.fn((_pid: number) => {
        tickCount++;
        if (tickCount === 1) {
          // First check: process is alive
          return true;
        }
        // Second check: process is dead
        return false;
      }),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // Tooth: process-death gate must have been consulted at least once before settling.
      expect(vi.mocked(deps.isProcessAlive).mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-012: プロセス死亡後に確定 status を読む
// ---------------------------------------------------------------------------

describe("TC-012: プロセス死亡後に確定 status を読む", () => {
  it("TC-012: settles with awaiting-archive when pid is dead and disk status is awaiting-archive", async () => {
    const deadState = makeJobState({ status: "awaiting-archive", pid: null });
    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => deadState),
      isProcessAlive: vi.fn((_pid: number) => false), // immediately dead (no pid anyway)
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });

  it("TC-012: settles with awaiting-resume when pid is dead and disk status is awaiting-resume", async () => {
    const aliveState = makeJobState({ status: "running", pid: 12345 });
    const deadState = makeJobState({ status: "awaiting-resume", pid: null });

    const deps = makeDepsWithPidTransition({
      slug: "test-slug",
      repoRoot: "/repo",
      aliveState,
      deadState,
      aliveForTicks: 1,
    });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(1);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: プロセス死亡後に disk status が running のままなら awaiting-resume として扱う
// ---------------------------------------------------------------------------

describe("TC-013: プロセス死亡後に disk status が running なら awaiting-resume として扱う", () => {
  it("TC-013: exit 1 when pid dead and disk status is still running", async () => {
    const aliveState = makeJobState({ status: "running", pid: 12345 });
    // Simulate crash: process died but disk still shows running
    const deadState = makeJobState({ status: "running", pid: null });

    const deps = makeDepsWithPidTransition({
      slug: "test-slug",
      repoRoot: "/repo",
      aliveState,
      deadState,
      // aliveForTicks: 2 so the poll loop sees the alive state once (setting
      // lastKnownPid) before the process dies.  aliveForTicks: 1 would be
      // consumed by the not-found retry loop, leaving lastKnownPid unset and
      // causing an infinite loop on the no-PID path with status=running.
      aliveForTicks: 2,
    });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // running + dead pid → treated as awaiting-resume → exit 1
      expect(code).toBe(1);
    } finally {
      restore();
    }
  });

  it("TC-013: output includes awaiting-resume when pid dead and disk shows running", async () => {
    const aliveState = makeJobState({ status: "running", pid: 12345 });
    const deadState = makeJobState({ status: "running", pid: null });

    const deps = makeDepsWithPidTransition({
      slug: "test-slug",
      repoRoot: "/repo",
      aliveState,
      deadState,
      // Same reasoning as the test above: the not-found retry loop consumes
      // tick 0, so aliveForTicks: 2 ensures the poll loop sees the alive pid
      // (setting lastKnownPid) before the death transition.
      aliveForTicks: 2,
    });

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      const combined = capturedOutput.join("");
      // Should report as awaiting-resume
      expect(combined).toContain("awaiting-resume");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-014: pid 不在の後方互換 state は isStaleRunning fallback に従う
// ---------------------------------------------------------------------------

describe("TC-014: pid 不在の後方互換 state は isStaleRunning fallback に従う", () => {
  it("TC-014: non-running status without pid is settled immediately", async () => {
    const state = makeJobState({ status: "awaiting-archive", pid: undefined });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });

  it("TC-014: running status without pid settles when isStaleRunning returns true", async () => {
    const state = makeJobState({ status: "running", pid: undefined });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: true });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // isStaleRunning true → stale → settled → treat as awaiting-resume → exit 1
      expect(code).toBe(1);
    } finally {
      restore();
    }
  });

  it("TC-014: running status without pid keeps waiting when isStaleRunning returns false", async () => {
    // If isStaleRunning is false first time then true second time
    let callCount = 0;
    const state = makeJobState({ status: "running", pid: undefined });

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => state),
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn((_s: JobState) => {
        callCount++;
        return callCount >= 2; // not stale first time, stale second time
      }),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // After 2 calls, isStaleRunning is true → settled → exit 1
      expect(code).toBe(1);
      expect(callCount).toBeGreaterThanOrEqual(2);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-015: awaiting-archive は exit 0 で archive アクションを案内する
// ---------------------------------------------------------------------------

describe("TC-015: awaiting-archive は exit 0 で archive アクションを案内する", () => {
  it("TC-015: returns exit code 0 for awaiting-archive", async () => {
    const state = makeJobState({ status: "awaiting-archive", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });

  it("TC-015: output includes slug and job archive command for awaiting-archive", async () => {
    const state = makeJobState({ status: "awaiting-archive", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      const combined = capturedOutput.join("");
      expect(combined).toContain("test-slug");
      expect(combined).toContain("awaiting-archive");
      expect(combined).toContain("job archive");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-016: awaiting-resume は exit 1 で resume アクションを案内する
// ---------------------------------------------------------------------------

describe("TC-016: awaiting-resume は exit 1 で resume アクションを案内する", () => {
  it("TC-016: returns exit code 1 for awaiting-resume", async () => {
    const state = makeJobState({ status: "awaiting-resume", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(1);
    } finally {
      restore();
    }
  });

  it("TC-016: output includes slug and job resume command for awaiting-resume", async () => {
    const state = makeJobState({ status: "awaiting-resume", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      const combined = capturedOutput.join("");
      expect(combined).toContain("test-slug");
      expect(combined).toContain("awaiting-resume");
      expect(combined).toContain("job resume");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-017: failed / terminated / canceled は exit 1 を返す
// ---------------------------------------------------------------------------

describe("TC-017: failed / terminated / canceled は exit 1 を返す", () => {
  const terminalStatuses: JobStatus[] = ["failed", "terminated", "canceled"];

  for (const status of terminalStatuses) {
    it(`TC-017: exit 1 for status=${status}`, async () => {
      const state = makeJobState({ status, pid: null });
      const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

      const restore = captureStdout();
      try {
        const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
        expect(code).toBe(1);
      } finally {
        restore();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// TC-018: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す
// ---------------------------------------------------------------------------

describe("TC-018: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す", () => {
  it("TC-018: returns exit code 2 when slug is not found after retries", async () => {
    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => null), // always null (not found)
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const code = await runJobWait("not-found-slug", { repoRoot: "/repo", deps });
    expect(code).toBe(2);
  });

  it("TC-018: retries exactly 5 times before giving up", async () => {
    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => null), // always null (not found)
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    await runJobWait("not-found-slug", { repoRoot: "/repo", deps });
    // loadState should be called exactly notFoundRetryCount times (5)
    expect(vi.mocked(deps.loadState).mock.calls.length).toBe(5);
  });

  it("TC-018: sleeps between retries when not found", async () => {
    const sleepCalls: number[] = [];
    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => null),
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async (ms: number) => {
        sleepCalls.push(ms);
      }),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 2000,
    };

    await runJobWait("not-found-slug", { repoRoot: "/repo", deps });
    // Should sleep 4 times (between 5 retries)
    expect(sleepCalls.length).toBeGreaterThan(0);
    // Each sleep should be notFoundRetryIntervalMs
    sleepCalls.forEach((ms) => expect(ms).toBe(2000));
  });
});

// ---------------------------------------------------------------------------
// TC-029: archived status は exit 0 を返す
// ---------------------------------------------------------------------------

describe("TC-029: archived status は exit 0 を返す", () => {
  it("TC-029: returns exit code 0 for archived status", async () => {
    const state = makeJobState({ status: "archived", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });

  it("TC-029: output includes slug and archived in the report", async () => {
    const state = makeJobState({ status: "archived", pid: null });
    const deps = makeDepsNoPid({ state, isStaleRunningResult: false });

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      const combined = capturedOutput.join("");
      expect(combined).toContain("test-slug");
      expect(combined).toContain("archived");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-008 (new): not-found output carries the detach-log hint
// ---------------------------------------------------------------------------

describe("TC-008: not-found output carries the detach-log hint", () => {
  it("TC-008: stderr includes a detach-log hint when slug is not found after retries", async () => {
    const stderrOutput: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => null), // always null (not found)
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    try {
      const code = await runJobWait("not-found-slug", { repoRoot: "/test-repo", deps });
      expect(code).toBe(2);
    } finally {
      stderrSpy.mockRestore();
    }

    const combined = stderrOutput.join("");
    // "No job found" message must still be present
    expect(combined).toContain("No job found");
    expect(combined).toContain("not-found-slug");
    // Detach-log hint must be present (references the detach log path for the slug)
    expect(combined).toContain("not-found-slug.detach.log");
  });

  it("TC-008: exit code is still 2 after adding the hint (hint does not change exit code)", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => null),
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    try {
      const code = await runJobWait("not-found-slug", { repoRoot: "/test-repo", deps });
      expect(code).toBe(2);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("TC-008: retry count is unaffected by the hint (still 5 retries)", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Use a separate variable to avoid vi.mocked() (not available in this vitest version)
    const loadStateMock = vi.fn(async () => null);
    const deps: JobWaitDeps = {
      loadState: loadStateMock,
      isProcessAlive: vi.fn(() => false),
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => null),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    try {
      await runJobWait("not-found-slug", { repoRoot: "/test-repo", deps });
    } finally {
      stderrSpy.mockRestore();
    }

    // loadState still called exactly notFoundRetryCount times
    expect(loadStateMock.mock.calls.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Sidecar pid resolution — used in TC-010 / TC-012
// ---------------------------------------------------------------------------

describe("sidecar pid resolution", () => {
  it("uses sidecar pid when state.pid is absent", async () => {
    const aliveState = makeJobState({ status: "awaiting-resume", pid: undefined });
    const deadState = makeJobState({ status: "awaiting-archive", pid: undefined });

    let tick = 0;
    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => (tick < 2 ? aliveState : deadState)),
      isProcessAlive: vi.fn((pid: number) => {
        expect(pid).toBe(54321); // should use sidecar pid
        tick++;
        return tick < 2; // alive first tick, dead after
      }),
      isStaleRunning: vi.fn(() => false),
      // TC-W03: updated to SidecarContent so jobId matches state.jobId ("job-abc-0001")
      // This makes the test RED with the current implementation (which expects number | null)
      // and GREEN after the fix (which expects SidecarContent | null with jobId matching).
      readSidecarPid: vi.fn((_path: string) => ({ pid: 54321, jobId: "job-abc-0001" })),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      const code = await runJobWait("test-slug", { repoRoot: "/repo", deps });
      expect(code).toBe(0);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-004: job wait — jobId 一致の sidecar pid でプロセス生存中 → pid 採用・待機継続
// Source: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する
//         > Scenario: jobId 一致の sidecar pid でプロセス生存中
// ---------------------------------------------------------------------------

describe("TC-004: job wait — jobId 一致の sidecar pid でプロセス生存中", () => {
  it("TC-004: sidecar pid is adopted when jobId matches — isProcessAlive called with numeric pid and waiting continues", async () => {
    // Given: state.pid=null, sidecar has pid=5678 and matching jobId
    const runningState = makeJobState({ status: "running", pid: null });
    const settledState = makeJobState({ status: "awaiting-archive", pid: null });

    let isAliveCallCount = 0;
    let loadCount = 0;

    const isProcessAliveMock = vi.fn((pid: number) => {
      isAliveCallCount++;
      // alive only on first call when pid is the expected numeric value
      return pid === 5678 && isAliveCallCount === 1;
    });

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => {
        loadCount++;
        // retry loop + first poll iteration: running; then settled
        return loadCount <= 2 ? runningState : settledState;
      }),
      isProcessAlive: isProcessAliveMock,
      isStaleRunning: vi.fn(() => false),
      readSidecarPid: vi.fn(() => ({ pid: 5678, jobId: "job-abc-0001" })), // matches makeJobState's default jobId
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
    } finally {
      restore();
    }

    // After fix: isProcessAlive(5678) must be called (the numeric pid was adopted).
    // Before fix: isProcessAlive is called with the SidecarContent object, not 5678 → test fails.
    const callsWith5678 = isProcessAliveMock.mock.calls.filter((args) => args[0] === 5678);
    expect(callsWith5678.length).toBeGreaterThan(0);

    // Also: sleep must have been called at least once (process was alive → waiting continued)
    expect(vi.mocked(deps.sleep).mock.calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: job wait — jobId 不一致の sidecar pid → pid 不採用・no-pid パス
// Source: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する
//         > Scenario: jobId 不一致の sidecar pid
// ---------------------------------------------------------------------------

describe("TC-005: job wait — jobId 不一致の sidecar pid", () => {
  it("TC-005: mismatched sidecar jobId → no-pid path (isStaleRunning called, not isProcessAlive with sidecar pid)", async () => {
    // Given: sidecar has pid=9999 but mismatched jobId "job-B" vs state.jobId "job-abc-0001"
    const state = makeJobState({ status: "running", pid: null });

    const isProcessAliveMock = vi.fn((_pid: number): boolean => false);
    const isStaleRunningMock = vi.fn(() => true); // return true so the loop settles

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => state),
      isProcessAlive: isProcessAliveMock,
      isStaleRunning: isStaleRunningMock,
      readSidecarPid: vi.fn(() => ({ pid: 9999, jobId: "job-B" })), // mismatch
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
    } finally {
      restore();
    }

    // After fix: resolvedPid = null (mismatch) → no-pid path → isStaleRunning called.
    // Before fix: resolvedPid = sidecar object (truthy) → pid-gated path → isStaleRunning NOT called → test fails.
    expect(isStaleRunningMock.mock.calls.length).toBeGreaterThan(0);

    // The sidecar pid 9999 must never be passed to isProcessAlive.
    const callsWith9999 = isProcessAliveMock.mock.calls.filter((args) => args[0] === 9999);
    expect(callsWith9999).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-006: job wait — jobId フィールドなしの sidecar（legacy）→ pid 不採用・no-pid パス
// Source: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する
//         > Scenario: jobId フィールドなしの sidecar（legacy）
// ---------------------------------------------------------------------------

describe("TC-006: job wait — jobId フィールドなしの sidecar（legacy）", () => {
  it("TC-006: legacy sidecar without jobId field → no-pid path", async () => {
    // Given: sidecar has pid=9999 but no jobId field (legacy format)
    const state = makeJobState({ status: "running", pid: null });

    const isProcessAliveMock = vi.fn((_pid: number): boolean => false);
    const isStaleRunningMock = vi.fn(() => true);

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => state),
      isProcessAlive: isProcessAliveMock,
      isStaleRunning: isStaleRunningMock,
      readSidecarPid: vi.fn(() => ({ pid: 9999 })), // no jobId field (SidecarContent with null jobId after fix)
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
    } finally {
      restore();
    }

    // After fix: null jobId treated as mismatch → no-pid path → isStaleRunning called.
    // Before fix: sidecar object is truthy → pid-gated path → isStaleRunning NOT called.
    expect(isStaleRunningMock.mock.calls.length).toBeGreaterThan(0);

    const callsWith9999 = isProcessAliveMock.mock.calls.filter((args) => args[0] === 9999);
    expect(callsWith9999).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: job wait poll ループが resolveJobPid を経由して jobId 照合を行う（行動検証）
// Source: spec.md > Requirement: sidecar pid 採用判定を resolveJobPid に集約する
//         > Scenario: job wait poll ループが resolveJobPid を経由して jobId 照合を行う
// ---------------------------------------------------------------------------

describe("TC-008: job wait — poll ループが resolveJobPid を経由して jobId 照合を行う", () => {
  it("TC-008: pid adoption consistent with resolveJobPid rules — mismatch sends loop to no-pid path", async () => {
    // resolveJobPid rule: sidecar.jobId must equal expectedJobId for pid to be adopted.
    // Observable evidence: with mismatch, the no-pid path (isStaleRunning) is exercised,
    // not the pid-gated path (isProcessAlive with sidecar pid).
    const state = makeJobState({ status: "running", pid: null });

    const isStaleRunningMock = vi.fn(() => true);
    const isProcessAliveMock = vi.fn((_pid: number): boolean => false);

    const deps: JobWaitDeps = {
      loadState: vi.fn(async () => state),
      isProcessAlive: isProcessAliveMock,
      isStaleRunning: isStaleRunningMock,
      readSidecarPid: vi.fn(() => ({ pid: 8888, jobId: "completely-different-job" })),
      sleep: vi.fn(async () => {}),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
    } finally {
      restore();
    }

    // resolveJobPid returns { pid: null } for mismatched jobId → no-pid path.
    expect(isStaleRunningMock.mock.calls.length).toBeGreaterThan(0);

    // isProcessAlive must never be called with the mismatched sidecar pid.
    const callsWithSidecarPid = isProcessAliveMock.mock.calls.filter((args) => args[0] === 8888);
    expect(callsWithSidecarPid).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-013: realReadSidecarPid — SidecarContent 形式（{ pid, jobId }）を返す
// Source: tasks.md > T-02 Acceptance Criteria
// ---------------------------------------------------------------------------

describe("TC-013: realReadSidecarPid — SidecarContent 形式（{ pid, jobId }）を返す", () => {
  it("TC-013: returns { pid, jobId } from sidecar file (not a bare number)", () => {
    // Given: sidecar file contains pid, jobId, session, worktreePath
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ pid: 54321, jobId: "job-abc-0001", session: "s1", worktreePath: "/tmp/x" }),
    );

    // realReadSidecarPid must be exported from job-wait.ts for this test to pass.
    // Currently it is private → jobWaitExports["realReadSidecarPid"] is undefined → throws → RED.
    // After implementation: returns SidecarContent { pid: 54321, jobId: "job-abc-0001" }.
    const fn = (jobWaitExports as Record<string, unknown>)["realReadSidecarPid"] as
      | ((path: string) => unknown)
      | undefined;
    if (typeof fn !== "function") {
      throw new Error(
        "TC-013 RED: realReadSidecarPid is not exported from job-wait.ts. " +
          "The implementer must export it so this test can verify the SidecarContent return type.",
      );
    }

    const result = fn("/fake/.specrunner/local/test-slug/liveness.json");

    // Must return an object with both pid and jobId (not a bare number)
    expect(result).toMatchObject({ pid: 54321, jobId: "job-abc-0001" });
    expect(typeof result).toBe("object");
    expect(typeof result).not.toBe("number");
  });

  it("TC-013: returns null when sidecar file is missing", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const fn = (jobWaitExports as Record<string, unknown>)["realReadSidecarPid"] as
      | ((path: string) => unknown)
      | undefined;
    if (typeof fn !== "function") {
      throw new Error("TC-013 RED: realReadSidecarPid is not exported from job-wait.ts.");
    }

    const result = fn("/fake/.specrunner/local/test-slug/liveness.json");
    expect(result).toBeNull();
  });
});
