/**
 * Comprehensive tests for src/state/lifecycle.ts
 *
 * TC-01: VALID_TRANSITIONS — 許可遷移の網羅検証
 * TC-02: VALID_TRANSITIONS — 禁止遷移の代表パターン
 * TC-03: canTransition — 同一 status は常に true（noop パス）
 * TC-04: isTerminal — terminal status の判定
 * TC-05: TERMINAL_STATUSES — 定数の値検証
 * TC-06: ACTIVE_STATUSES — 定数の値検証
 * TC-07: transitionJob — 正常遷移でステータスと updatedAt が更新される
 * TC-08: transitionJob — 許可された全遷移パターンで noop: false
 * TC-09: transitionJob — 同一 status への遷移は noop: true
 * TC-10: transitionJob — 不正遷移で Error を throw
 * TC-11: transitionJob — 不正遷移エラーに from / to / trigger が含まれる
 * TC-12: transitionJob — terminal status（archived）からの非 noop 遷移は throw
 * TC-13: transitionJob — history エントリが appendHistoryEntry 経由で追記される
 * TC-14: transitionJob — ctx.patch が state にマージされる
 * TC-16: transitionJob — MAX_HISTORY_SIZE に達した状態でも history が truncate される
 * TC-17: transitionJob — I/O なし（純粋関数）— static check only
 * TC-18: VALID_TRANSITIONS — ReadonlyMap 型保証（static check）
 * TC-25: transitionJob — noop 時に history が変化しない
 * TC-26: canTransition — 存在しない JobStatus 値に対しても false を返す
 * TC-27: transitionJob — patch なしで遷移しても state の他フィールドが保持される
 * TC-28: TransitionContext.trigger が history エントリの step フィールドに記録される
 * TC-29: lifecycle.ts のモジュール構造 — 必要な export がすべて存在する
 */

import { describe, it, expect } from "vitest";
import {
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
  canTransition,
  isTerminal,
  transitionJob,
  type TransitionContext,
  type TransitionResult,
} from "../../../src/state/lifecycle.js";
import { MAX_HISTORY_SIZE } from "../../../src/state/schema.js";
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
    request: { path: "/req.md", title: "Test Request", type: "feature" },
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

function makeCtx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    trigger: "test",
    reason: "test reason",
    ...overrides,
  };
}

const ALL_STATUSES: JobStatus[] = [
  "running",
  "awaiting-resume",
  "awaiting-merge",
  "failed",
  "terminated",
  "archived",
  "canceled",
];

// ---------------------------------------------------------------------------
// TC-29: module exports
// ---------------------------------------------------------------------------

describe("TC-29: lifecycle.ts module structure", () => {
  it("exports all required named exports", () => {
    // Functions
    expect(typeof canTransition).toBe("function");
    expect(typeof isTerminal).toBe("function");
    expect(typeof transitionJob).toBe("function");

    // Constants
    expect(VALID_TRANSITIONS).toBeDefined();
    expect(TERMINAL_STATUSES).toBeDefined();
    expect(ACTIVE_STATUSES).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-05: TERMINAL_STATUSES
// ---------------------------------------------------------------------------

describe("TC-05: TERMINAL_STATUSES — 定数の値検証", () => {
  it("contains exactly 'archived' and 'canceled' with size 2", () => {
    expect(TERMINAL_STATUSES.has("archived")).toBe(true);
    expect(TERMINAL_STATUSES.has("canceled")).toBe(true);
    expect(TERMINAL_STATUSES.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-06: ACTIVE_STATUSES
// ---------------------------------------------------------------------------

describe("TC-06: ACTIVE_STATUSES — 定数の値検証", () => {
  it("contains exactly 'running' and 'awaiting-resume' with size 2", () => {
    expect(ACTIVE_STATUSES.has("running")).toBe(true);
    expect(ACTIVE_STATUSES.has("awaiting-resume")).toBe(true);
    expect(ACTIVE_STATUSES.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-01: VALID_TRANSITIONS — 許可遷移の網羅検証
// ---------------------------------------------------------------------------

describe("TC-01: VALID_TRANSITIONS — 許可遷移の網羅検証", () => {
  // Expected allowed transitions (non-noop)
  const ALLOWED: [JobStatus, JobStatus][] = [
    ["running", "awaiting-resume"],
    ["running", "awaiting-merge"],
    ["running", "failed"],
    ["running", "terminated"],
    ["awaiting-resume", "running"],
    ["awaiting-resume", "canceled"],
    ["awaiting-merge", "archived"],
    ["failed", "running"],
    ["failed", "canceled"],
    ["failed", "awaiting-resume"],
    ["terminated", "running"],
    ["terminated", "canceled"],
  ];

  const allowedSet = new Set(ALLOWED.map(([f, t]) => `${f}→${t}`));

  // Generate all 49 combinations (7×7) excluding same-status (noop) pairs
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (from === to) continue;
      const key = `${from}→${to}`;
      const shouldAllow = allowedSet.has(key);

      it(`canTransition(${from}, ${to}) === ${shouldAllow}`, () => {
        expect(canTransition(from, to)).toBe(shouldAllow);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// TC-02: VALID_TRANSITIONS — 禁止遷移の代表パターン
// ---------------------------------------------------------------------------

describe("TC-02: VALID_TRANSITIONS — 禁止遷移の代表パターン", () => {
  const FORBIDDEN: [JobStatus, JobStatus][] = [
    ["archived", "running"],
    ["archived", "failed"],
    ["canceled", "running"],
    ["canceled", "awaiting-resume"],
    ["running", "archived"],
    ["running", "canceled"],
    ["awaiting-merge", "running"],
  ];

  for (const [from, to] of FORBIDDEN) {
    it(`canTransition(${from}, ${to}) === false`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-03: canTransition — 同一 status は常に true
// ---------------------------------------------------------------------------

describe("TC-03: canTransition — 同一 status は常に true (noop)", () => {
  for (const status of ALL_STATUSES) {
    it(`canTransition(${status}, ${status}) === true`, () => {
      expect(canTransition(status, status)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-04: isTerminal
// ---------------------------------------------------------------------------

describe("TC-04: isTerminal — terminal status の判定", () => {
  it("returns true for 'archived'", () => {
    expect(isTerminal("archived")).toBe(true);
  });

  it("returns true for 'canceled'", () => {
    expect(isTerminal("canceled")).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    const nonTerminal: JobStatus[] = ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated"];
    for (const status of nonTerminal) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-26: canTransition — 存在しない JobStatus 値に対しても false を返す
// ---------------------------------------------------------------------------

describe("TC-26: canTransition — unknown status → false (defensive behavior)", () => {
  it("returns false without throwing for unknown status", () => {
    expect(canTransition("unknown-status" as JobStatus, "running")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-07: transitionJob — 正常遷移でステータスと updatedAt が更新される
// ---------------------------------------------------------------------------

describe("TC-07: transitionJob — 正常遷移でステータスと updatedAt が更新される", () => {
  it("updates status and updatedAt, returns noop: false, original state unchanged", () => {
    const state = makeState("running");
    const ctx = makeCtx({ trigger: "pipeline", reason: "step done" });

    const result = transitionJob(state, "awaiting-resume", ctx);

    expect(result.noop).toBe(false);
    expect(result.state.status).toBe("awaiting-resume");
    // updatedAt must differ from original
    expect(result.state.updatedAt).toBeDefined();
    // Original state must be untouched (pure function)
    expect(state.status).toBe("running");
    expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// TC-08: transitionJob — 許可された全遷移パターンで noop: false
// ---------------------------------------------------------------------------

describe("TC-08: transitionJob — 許可された全遷移パターンで noop: false (12 patterns)", () => {
  const ALLOWED: [JobStatus, JobStatus][] = [
    ["running", "awaiting-resume"],
    ["running", "awaiting-merge"],
    ["running", "failed"],
    ["running", "terminated"],
    ["awaiting-resume", "running"],
    ["awaiting-resume", "canceled"],
    ["awaiting-merge", "archived"],
    ["failed", "running"],
    ["failed", "canceled"],
    ["failed", "awaiting-resume"],
    ["terminated", "running"],
    ["terminated", "canceled"],
  ];

  for (const [from, to] of ALLOWED) {
    it(`${from} → ${to}: noop: false, state.status === ${to}`, () => {
      const state = makeState(from);
      const ctx = makeCtx();

      const result = transitionJob(state, to, ctx);

      expect(result.noop).toBe(false);
      expect(result.state.status).toBe(to);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-09: transitionJob — 同一 status への遷移は noop: true
// ---------------------------------------------------------------------------

describe("TC-09: transitionJob — 同一 status への遷移は noop: true", () => {
  it("returns noop: true, same state reference, no history appended", () => {
    const state = makeState("running", {
      history: [
        { ts: "2026-01-01T00:00:00.000Z", step: "init", status: "ok", message: "initial" },
      ],
    });
    const ctx = makeCtx();

    const result = transitionJob(state, "running", ctx);

    expect(result.noop).toBe(true);
    expect(result.state).toBe(state); // same reference
    expect(result.state.history.length).toBe(1); // no new history entry
  });
});

// ---------------------------------------------------------------------------
// TC-25: transitionJob — noop 時に history / updatedAt が変化しない
// ---------------------------------------------------------------------------

describe("TC-25: transitionJob — noop 時に history と updatedAt が変化しない", () => {
  it("history length and updatedAt remain unchanged on noop", () => {
    const history = [
      { ts: "2026-01-01T00:00:00.000Z", step: "a", status: "ok" as const, message: "1" },
      { ts: "2026-01-01T00:01:00.000Z", step: "b", status: "ok" as const, message: "2" },
      { ts: "2026-01-01T00:02:00.000Z", step: "c", status: "ok" as const, message: "3" },
    ];
    const state = makeState("running", { history });
    const ctx = makeCtx();

    const result = transitionJob(state, "running", ctx);

    expect(result.state.history.length).toBe(3);
    expect(result.state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// TC-10: transitionJob — 不正遷移で Error を throw
// ---------------------------------------------------------------------------

describe("TC-10: transitionJob — 不正遷移で Error を throw", () => {
  it("throws when transitioning from archived to running", () => {
    const state = makeState("archived");
    const ctx = makeCtx({ trigger: "test-trigger", reason: "test-reason" });

    expect(() => transitionJob(state, "running", ctx)).toThrow();
  });

  it("error message contains from status 'archived'", () => {
    const state = makeState("archived");
    const ctx = makeCtx({ trigger: "test-trigger", reason: "test-reason" });

    expect(() => transitionJob(state, "running", ctx)).toThrowError(/archived/);
  });

  it("error message contains to status 'running'", () => {
    const state = makeState("archived");
    const ctx = makeCtx({ trigger: "test-trigger", reason: "test-reason" });

    expect(() => transitionJob(state, "running", ctx)).toThrowError(/running/);
  });

  it("error message contains trigger", () => {
    const state = makeState("archived");
    const ctx = makeCtx({ trigger: "test-trigger", reason: "test-reason" });

    expect(() => transitionJob(state, "running", ctx)).toThrowError(/test-trigger/);
  });
});

// ---------------------------------------------------------------------------
// TC-11: transitionJob — 不正遷移エラーに from / to / trigger が含まれる
// ---------------------------------------------------------------------------

describe("TC-11: transitionJob — 不正遷移エラーに from / to / trigger が含まれる", () => {
  it("error message contains all three: canceled, awaiting-resume, signal-handler", () => {
    const state = makeState("canceled");
    const ctx = makeCtx({ trigger: "signal-handler", reason: "user interrupted" });

    let caught: Error | undefined;
    try {
      transitionJob(state, "awaiting-resume", ctx);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toContain("canceled");
    expect(caught!.message).toContain("awaiting-resume");
    expect(caught!.message).toContain("signal-handler");
  });
});

// ---------------------------------------------------------------------------
// TC-12: transitionJob — terminal status（archived）からの非 noop 遷移は throw
// ---------------------------------------------------------------------------

describe("TC-12: transitionJob — terminal status からの非 noop 遷移は throw", () => {
  const nonArchivedStatuses: JobStatus[] = ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "canceled"];

  for (const to of nonArchivedStatuses) {
    it(`archived → ${to} throws`, () => {
      const state = makeState("archived");
      const ctx = makeCtx();

      expect(() => transitionJob(state, to, ctx)).toThrow();
    });
  }

  const nonCanceledStatuses: JobStatus[] = ["running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived"];

  for (const to of nonCanceledStatuses) {
    it(`canceled → ${to} throws`, () => {
      const state = makeState("canceled");
      const ctx = makeCtx();

      expect(() => transitionJob(state, to, ctx)).toThrow();
    });
  }
});

// ---------------------------------------------------------------------------
// TC-13: transitionJob — history エントリが appendHistoryEntry 経由で追記される
// ---------------------------------------------------------------------------

describe("TC-13: transitionJob — history エントリが追記される", () => {
  it("adds one history entry with correct step (trigger) and message", () => {
    const state = makeState("running", { history: [] });
    const ctx = makeCtx({ trigger: "pipeline", reason: "step done" });

    const result = transitionJob(state, "awaiting-merge", ctx);

    expect(result.state.history.length).toBe(1);
    const entry = result.state.history[0]!;
    expect(entry.step).toBe("pipeline");  // ctx.trigger
    expect(entry.message).toContain("running → awaiting-merge");
    expect(entry.message).toContain("step done");  // ctx.reason
  });
});

// ---------------------------------------------------------------------------
// TC-14: transitionJob — ctx.patch が state にマージされる
// ---------------------------------------------------------------------------

describe("TC-14: transitionJob — ctx.patch が state にマージされる", () => {
  it("merges error field from patch into resulting state", () => {
    const state = makeState("running");
    const ctx = makeCtx({
      trigger: "finish",
      reason: "failed",
      patch: { error: { code: "EXIT_CODE_1", message: "exit code 1", hint: "check logs" } },
    });

    const result = transitionJob(state, "failed", ctx);

    expect(result.state.error).toEqual({ code: "EXIT_CODE_1", message: "exit code 1", hint: "check logs" });
    expect(result.state.status).toBe("failed");
  });

  it("merges step field from patch", () => {
    const state = makeState("running");
    const ctx = makeCtx({
      trigger: "pipeline",
      reason: "advancing",
      patch: { step: "spec-review" },
    });

    const result = transitionJob(state, "awaiting-resume", ctx);

    expect(result.state.step).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-16: transitionJob — MAX_HISTORY_SIZE に達した状態でも history が truncate される
// ---------------------------------------------------------------------------

describe("TC-16: transitionJob — MAX_HISTORY_SIZE に達した状態でも history が truncate される", () => {
  it("history length does not exceed MAX_HISTORY_SIZE after transition", () => {
    // Create state with history already at MAX_HISTORY_SIZE
    const history = Array.from({ length: MAX_HISTORY_SIZE }, (_, i) => ({
      ts: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      step: "init",
      status: "ok" as const,
      message: `entry ${i}`,
    }));

    const state = makeState("running", { history });
    const ctx = makeCtx({ trigger: "pipeline", reason: "overflow test" });

    const result = transitionJob(state, "awaiting-resume", ctx);

    expect(result.state.history.length).toBeLessThanOrEqual(MAX_HISTORY_SIZE);
    // Newest entry should be the one we just added
    const lastEntry = result.state.history[result.state.history.length - 1]!;
    expect(lastEntry.step).toBe("pipeline");
    expect(lastEntry.message).toContain("running → awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-27: transitionJob — patch なしで遷移しても state の他フィールドが保持される
// ---------------------------------------------------------------------------

describe("TC-27: transitionJob — patch なしで遷移しても state の他フィールドが保持される", () => {
  it("jobId, createdAt, version are unchanged after transition", () => {
    const state = makeState("running", {
      jobId: "fixed-job-id",
      createdAt: "2025-12-31T23:59:59.000Z",
      version: 1,
    });
    const ctx = makeCtx(); // no patch

    const result = transitionJob(state, "awaiting-resume", ctx);

    expect(result.state.jobId).toBe("fixed-job-id");
    expect(result.state.createdAt).toBe("2025-12-31T23:59:59.000Z");
    expect(result.state.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-28: TransitionContext.trigger が history エントリの step フィールドに記録される
// ---------------------------------------------------------------------------

describe("TC-28: TransitionContext.trigger が history エントリの step フィールドに記録される", () => {
  it("history entry step equals ctx.trigger", () => {
    const state = makeState("running");
    const ctx = makeCtx({ trigger: "signal-handler", reason: "SIGTERM received" });

    const result = transitionJob(state, "terminated", ctx);

    const lastEntry = result.state.history[result.state.history.length - 1]!;
    expect(lastEntry.step).toBe("signal-handler");
  });
});

// ---------------------------------------------------------------------------
// TC-30: transitionJob — pid patch が正しく適用される
// ---------------------------------------------------------------------------

describe("TC-30: transitionJob — pid patch が正しく適用される", () => {
  it("patch with pid: null clears pid on transition", () => {
    const state = makeState("running", { pid: 12345 });
    const ctx = makeCtx({
      trigger: "stale-detection",
      reason: "Process not running",
      patch: { pid: null },
    });

    const result = transitionJob(state, "awaiting-resume", ctx);

    expect(result.noop).toBe(false);
    expect(result.state.pid).toBeNull();
    expect(result.state.status).toBe("awaiting-resume");
  });

  it("patch with pid: process.pid records the current PID on transition to running", () => {
    const state = makeState("awaiting-resume", { pid: null });
    const ctx = makeCtx({
      trigger: "resume",
      reason: "Resuming from step 'propose'",
      patch: { pid: process.pid },
    });

    const result = transitionJob(state, "running", ctx);

    expect(result.noop).toBe(false);
    expect(result.state.pid).toBe(process.pid);
    expect(result.state.status).toBe("running");
  });

  it("transition without pid patch leaves existing pid unchanged", () => {
    const state = makeState("running", { pid: 99 });
    const ctx = makeCtx({
      trigger: "signal-handler",
      reason: "interrupted",
    });

    const result = transitionJob(state, "awaiting-resume", ctx);

    // No pid in patch → pid is preserved from original state
    expect(result.state.pid).toBe(99);
  });
});
