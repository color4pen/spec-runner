/**
 * Tests for src/state/reconcile.ts
 *
 * TC-01: reconcileStaleRunning — running 以外は null を返す
 * TC-02: reconcileStaleRunning — PID が alive の場合は null を返す
 * TC-03: reconcileStaleRunning — PID が dead の場合は TransitionResult を返す
 * TC-04: reconcileStaleRunning — PID なし + updatedAt が 15 分以内は null を返す
 * TC-05: reconcileStaleRunning — PID なし + updatedAt が 15 分超は TransitionResult を返す
 * TC-06: reconcileStaleRunning — updatedAt がちょうど 15 分は境界値（stale でない）
 * TC-07: reconcilePrState — awaiting-merge 以外は null を返す
 * TC-08: reconcilePrState — awaiting-merge + OPEN は null を返す
 * TC-09: reconcilePrState — awaiting-merge + CLOSED は null を返す
 * TC-10: reconcilePrState — awaiting-merge + MERGED は TransitionResult を返す
 * TC-11: reconcile モジュールの export 確認
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  reconcileStaleRunning,
  reconcilePrState,
} from "../../../src/state/reconcile.js";
import type { JobState, JobStatus } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeState(status: JobStatus = "running", overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test Request", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status,
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-11: module exports
// ---------------------------------------------------------------------------

describe("TC-11: reconcile.ts module structure", () => {
  it("exports reconcileStaleRunning and reconcilePrState", () => {
    expect(typeof reconcileStaleRunning).toBe("function");
    expect(typeof reconcilePrState).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-01: reconcileStaleRunning — running 以外は null
// ---------------------------------------------------------------------------

describe("TC-01: reconcileStaleRunning — running 以外は null を返す", () => {
  const nonRunningStatuses: JobStatus[] = [
    "awaiting-resume",
    "awaiting-merge",
    "failed",
    "terminated",
    "archived",
    "canceled",
  ];

  for (const status of nonRunningStatuses) {
    it(`status="${status}" → null`, () => {
      const state = makeState(status);
      expect(reconcileStaleRunning(state)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// TC-02: reconcileStaleRunning — PID が alive の場合は null
// ---------------------------------------------------------------------------

describe("TC-02: reconcileStaleRunning — PID が alive の場合は null", () => {
  it("returns null when pid is the current process (alive)", () => {
    const state = makeState("running", { pid: process.pid });
    expect(reconcileStaleRunning(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-03: reconcileStaleRunning — PID が dead の場合は TransitionResult
// ---------------------------------------------------------------------------

describe("TC-03: reconcileStaleRunning — PID が dead の場合は TransitionResult", () => {
  it("returns TransitionResult with status=awaiting-resume when pid is dead", () => {
    // PID 999999 is extremely unlikely to exist
    const state = makeState("running", { pid: 999999 });
    const result = reconcileStaleRunning(state);
    expect(result).not.toBeNull();
    expect(result!.state.status).toBe("awaiting-resume");
    expect(result!.noop).toBe(false);
  });

  it("TransitionResult history entry has trigger=reconcile and reason=stale running detected", () => {
    const state = makeState("running", { pid: 999999 });
    const result = reconcileStaleRunning(state);
    expect(result).not.toBeNull();
    const lastEntry = result!.state.history[result!.state.history.length - 1]!;
    expect(lastEntry.step).toBe("reconcile");
    expect(lastEntry.message).toContain("stale running detected");
  });
});

// ---------------------------------------------------------------------------
// TC-04: reconcileStaleRunning — PID なし + updatedAt < 15min → null
// ---------------------------------------------------------------------------

describe("TC-04: reconcileStaleRunning — PID なし + updatedAt が 15 分以内は null", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when no pid and updatedAt is 14 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const fourteenMinutesAgo = new Date(now.getTime() - 14 * 60 * 1000).toISOString();
    const state = makeState("running", { pid: undefined, updatedAt: fourteenMinutesAgo });
    expect(reconcileStaleRunning(state)).toBeNull();
  });

  it("returns null when no pid and updatedAt is 5 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const state = makeState("running", { pid: undefined, updatedAt: fiveMinutesAgo });
    expect(reconcileStaleRunning(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-05: reconcileStaleRunning — PID なし + updatedAt > 15min → TransitionResult
// ---------------------------------------------------------------------------

describe("TC-05: reconcileStaleRunning — PID なし + updatedAt が 15 分超は TransitionResult", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns TransitionResult when no pid and updatedAt is 16 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000).toISOString();
    const state = makeState("running", { pid: undefined, updatedAt: sixteenMinutesAgo });
    const result = reconcileStaleRunning(state);
    expect(result).not.toBeNull();
    expect(result!.state.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-06: reconcileStaleRunning — updatedAt がちょうど 15 分は境界値
// ---------------------------------------------------------------------------

describe("TC-06: reconcileStaleRunning — updatedAt がちょうど 15 分は境界値", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when no pid and updatedAt is exactly 15 minutes ago (not stale, boundary is >)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const exactly15MinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const state = makeState("running", { pid: undefined, updatedAt: exactly15MinutesAgo });
    // Boundary: elapsed === threshold → not stale (implementation uses >)
    expect(reconcileStaleRunning(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-07: reconcilePrState — awaiting-merge 以外は null
// ---------------------------------------------------------------------------

describe("TC-07: reconcilePrState — awaiting-merge 以外は null", () => {
  const nonAwaitingMergeStatuses: JobStatus[] = [
    "running",
    "awaiting-resume",
    "failed",
    "terminated",
    "archived",
    "canceled",
  ];

  for (const status of nonAwaitingMergeStatuses) {
    it(`status="${status}" + MERGED → null`, () => {
      const state = makeState(status);
      expect(reconcilePrState(state, "MERGED")).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// TC-08: reconcilePrState — awaiting-merge + OPEN は null
// ---------------------------------------------------------------------------

describe("TC-08: reconcilePrState — awaiting-merge + OPEN は null", () => {
  it("returns null when status=awaiting-merge and prStatus=OPEN", () => {
    const state = makeState("awaiting-merge");
    expect(reconcilePrState(state, "OPEN")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-09: reconcilePrState — awaiting-merge + CLOSED は null
// ---------------------------------------------------------------------------

describe("TC-09: reconcilePrState — awaiting-merge + CLOSED は null", () => {
  it("returns null when status=awaiting-merge and prStatus=CLOSED", () => {
    const state = makeState("awaiting-merge");
    expect(reconcilePrState(state, "CLOSED")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-10: reconcilePrState — awaiting-merge + MERGED は TransitionResult
// ---------------------------------------------------------------------------

describe("TC-10: reconcilePrState — awaiting-merge + MERGED は TransitionResult", () => {
  it("returns TransitionResult with status=archived", () => {
    const state = makeState("awaiting-merge");
    const result = reconcilePrState(state, "MERGED");
    expect(result).not.toBeNull();
    expect(result!.state.status).toBe("archived");
    expect(result!.noop).toBe(false);
  });

  it("history entry has trigger=reconcile and reason=PR merged externally", () => {
    const state = makeState("awaiting-merge");
    const result = reconcilePrState(state, "MERGED");
    expect(result).not.toBeNull();
    const lastEntry = result!.state.history[result!.state.history.length - 1]!;
    expect(lastEntry.step).toBe("reconcile");
    expect(lastEntry.message).toContain("PR merged externally");
  });
});
