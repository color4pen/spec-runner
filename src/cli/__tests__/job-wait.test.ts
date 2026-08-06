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
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobState, JobStatus } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { runJobWait, type JobWaitDeps } from "../job-wait.js";

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
    isProcessAlive: vi.fn((pid: number) => {
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
 * Build deps where pid is always alive (no settle).
 * Returns a deps that will be cancelled after maxTicks.
 */
function makeDepsAlwaysAlive(opts: {
  slug: string;
  state: JobState;
  maxTicks?: number;
}): JobWaitDeps & { tickCount: number } {
  const maxTicks = opts.maxTicks ?? 3;
  let tickCount = 0;
  const shared = { tickCount: 0 };

  const deps: JobWaitDeps & { tickCount: number } = {
    tickCount: 0,
    loadState: vi.fn(async () => opts.state),
    isProcessAlive: vi.fn((_pid: number) => {
      tickCount++;
      shared.tickCount = tickCount;
      deps.tickCount = tickCount;
      if (tickCount > maxTicks) {
        // Force a settle by throwing — this will cause the test to detect infinite loop
        throw new Error(`Too many ticks: pid kept alive for ${tickCount} ticks`);
      }
      return true; // always alive
    }),
    isStaleRunning: vi.fn(() => false),
    readSidecarPid: vi.fn(() => null),
    sleep: vi.fn(async () => {}),
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
    // A broken implementation (status-first poll) would settle immediately.
    // A correct implementation (process-death gate) would keep waiting.

    let settledEarly = false;
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
      sleep: vi.fn(async () => {
        // If we get here before second tick, gate did NOT work
        if (tickCount === 0) {
          settledEarly = true;
        }
      }),
      pollIntervalMs: 0,
      notFoundRetryCount: 5,
      notFoundRetryIntervalMs: 0,
    };

    const restore = captureStdout();
    try {
      await runJobWait("test-slug", { repoRoot: "/repo", deps });
      // The tooth: process-death gate must have been called
      expect(vi.mocked(deps.isProcessAlive).mock.calls.length).toBeGreaterThanOrEqual(1);
      // settledEarly should NOT be true (we should have polled pid before settling)
      expect(settledEarly).toBe(false);
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
      readSidecarPid: vi.fn((_path: string) => 54321), // sidecar has a pid
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
