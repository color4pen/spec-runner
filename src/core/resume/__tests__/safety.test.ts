/**
 * Unit tests for isStaleRunning in src/core/resume/safety.ts
 *
 * TC-001: jobId 一致の sidecar pid を持つプロセスが生存中 → false
 * TC-002: jobId 不一致の sidecar pid → true (stale)
 * TC-003: sidecar に jobId フィールドが存在しない（legacy sidecar）→ true (stale)
 * TC-007: isStaleRunning が resolveJobPid を経由して jobId 照合を行う（行動検証）
 * TC-009: jobId 一致の sidecar pid かつプロセス死亡 → true (stale)
 * TC-010: sidecar に pid フィールドが存在しない → true (stale)
 * TC-011: sidecar ファイル不在 → true (stale)
 * TC-012: state.pid 存在時は Priority 1 が sidecar より優先される
 * TC-016: state.jobId が undefined の場合は stale 側に倒れる
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn() };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import type { JobState } from "../../../state/schema.js";
import { isStaleRunning } from "../safety.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Use the test process's own PID as the "alive" pid — guaranteed alive. */
const ALIVE_PID = process.pid;

/**
 * A PID value that isProcessAlive treats as dead.
 * Using a very large number (beyond typical OS max PID) → process.kill throws ESRCH.
 * Fallback: on platforms where this PID might exist, TC-009 is still safe because
 * we are not making process behaviour assertions there.
 */
const DEAD_PID = 999_999_999;

const SIDECAR_PATH = "/fake/.specrunner/local/test-slug/liveness.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunningState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-A",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    pid: null,
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function mockSidecarContent(content: Record<string, unknown>): void {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(content));
}

function mockSidecarMissing(): void {
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(fs.readFileSync).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-001: jobId 一致の sidecar pid を持つプロセスが生存中 → false (not stale)
// Source: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する
//         > Scenario: jobId 一致の sidecar pid を持つプロセスが生存中
// ---------------------------------------------------------------------------

describe("TC-001: isStaleRunning — jobId 一致の sidecar pid を持つプロセスが生存中", () => {
  it("TC-001: returns false when sidecar jobId matches state.jobId and process is alive", () => {
    // Given: matching jobId, alive process
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-A" });

    // When / Then: not stale (process is alive and jobId matches)
    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-002: jobId 不一致の sidecar pid → true (stale), プロセス生死不問
// Source: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する
//         > Scenario: jobId 不一致の sidecar pid
// ---------------------------------------------------------------------------

describe("TC-002: isStaleRunning — jobId 不一致の sidecar pid", () => {
  it("TC-002: returns true when sidecar jobId does not match state.jobId (process is alive)", () => {
    // Given: sidecar jobId is "job-B", state.jobId is "job-A" — mismatch
    // ALIVE_PID is used so that without jobId check the broken code would return false.
    // After fix: sidecar pid must NOT be adopted → stale.
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-B" }); // mismatch

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });

  it("TC-002: returns true for jobId mismatch regardless of process liveness", () => {
    // Same with a dead process — result must still be true
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: DEAD_PID, jobId: "job-B" });

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: sidecar に jobId フィールドが存在しない（legacy sidecar）→ true (stale)
// Source: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する
//         > Scenario: sidecar に jobId フィールドが存在しない（legacy sidecar）
// ---------------------------------------------------------------------------

describe("TC-003: isStaleRunning — sidecar に jobId フィールドが存在しない（legacy sidecar）", () => {
  it("TC-003: returns true when sidecar has no jobId field (legacy format), even if process is alive", () => {
    // Given: legacy sidecar with pid only — no jobId field.
    // Without fix: isProcessAlive(ALIVE_PID) → false (not stale) — WRONG.
    // After fix: null jobId treated as mismatch → stale.
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID }); // no jobId field

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007: isStaleRunning が resolveJobPid を経由して jobId 照合を行う（行動検証）
// Source: spec.md > Requirement: sidecar pid 採用判定を resolveJobPid に集約する
//         > Scenario: isStaleRunning が resolveJobPid を経由して jobId 照合を行う
// ---------------------------------------------------------------------------

describe("TC-007: isStaleRunning — resolveJobPid 経由の jobId 照合（行動検証）", () => {
  it("TC-007: jobId mismatch → stale regardless of process liveness (resolveJobPid rule)", () => {
    // The resolveJobPid rule: sidecar pid is evidence only when jobId matches.
    // A process alive at a mismatched sidecar pid must not block the stale verdict.
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-X" }); // mismatch

    // resolveJobPid would return { pid: null } here.
    // isStaleRunning must return true (stale) despite the process being alive.
    expect(isStaleRunning(state, SIDECAR_PATH)).toBe(true);
  });

  it("TC-007: jobId match → not stale when process alive (resolveJobPid positive path)", () => {
    // The positive path of resolveJobPid: jobId match → pid adopted → liveness probe runs.
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-A" }); // match

    expect(isStaleRunning(state, SIDECAR_PATH)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-009: jobId 一致の sidecar pid かつプロセス死亡 → true (stale)
// Source: tasks.md > T-03 > TC-S02
// ---------------------------------------------------------------------------

describe("TC-009: isStaleRunning — jobId 一致の sidecar pid かつプロセス死亡", () => {
  it("TC-009: returns true when sidecar jobId matches but process is dead", () => {
    // Given: matching jobId, dead process
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ pid: DEAD_PID, jobId: "job-A" });

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-010: sidecar に pid フィールドが存在しない → true (stale)
// Source: tasks.md > T-03 > TC-S05
// ---------------------------------------------------------------------------

describe("TC-010: isStaleRunning — sidecar に pid フィールドが存在しない", () => {
  it("TC-010: returns true when sidecar has jobId but no pid field", () => {
    // Given: sidecar has jobId matching state.jobId, but no pid
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarContent({ jobId: "job-A" }); // no pid field

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-011: sidecar ファイル不在 → true (stale)
// Source: tasks.md > T-03 > TC-S06
// ---------------------------------------------------------------------------

describe("TC-011: isStaleRunning — sidecar ファイル不在", () => {
  it("TC-011: returns true when sidecar file does not exist", () => {
    const state = makeRunningState({ pid: null, jobId: "job-A" });
    mockSidecarMissing();

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012: state.pid 存在時は Priority 1 が sidecar より優先される
// Source: tasks.md > T-03 > TC-S07
// ---------------------------------------------------------------------------

describe("TC-012: isStaleRunning — state.pid 存在時は Priority 1 が sidecar より優先される", () => {
  it("TC-012: uses state.pid for liveness when present; mismatched sidecar pid is not adopted", () => {
    // Given: state.pid = ALIVE_PID (alive), sidecar has mismatched jobId with DEAD_PID
    // Priority 1 takes ALIVE_PID → not stale.
    // Sidecar pid (DEAD_PID) must NOT be used.
    const state = makeRunningState({ pid: ALIVE_PID, jobId: "job-A" });
    mockSidecarContent({ pid: DEAD_PID, jobId: "job-B" });

    const result = isStaleRunning(state, SIDECAR_PATH);
    // Priority 1: ALIVE_PID is alive → not stale
    expect(result).toBe(false);
  });

  it("TC-012: state.pid dead + mismatched sidecar → stale (Priority 1 still takes precedence)", () => {
    // Given: state.pid = DEAD_PID (dead), sidecar has ALIVE_PID with mismatched jobId
    // Priority 1 takes DEAD_PID → stale. Sidecar ALIVE_PID must not rescue it.
    const state = makeRunningState({ pid: DEAD_PID, jobId: "job-A" });
    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-B" });

    const result = isStaleRunning(state, SIDECAR_PATH);
    // Priority 1: DEAD_PID is dead → stale
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016: state.jobId が undefined の場合は stale 側に倒れる
// Source: design.md > Risks / Trade-offs
// ---------------------------------------------------------------------------

describe("TC-016: isStaleRunning — state.jobId が undefined の場合は stale 側に倒れる", () => {
  it("TC-016: returns true when state.jobId is undefined (old schema) even if sidecar process is alive", () => {
    // Given: state.jobId is undefined (legacy state), sidecar has pid=ALIVE_PID
    // After fix: undefined === "job-A" is false → sidecar not adopted → stale.
    // Before fix: isProcessAlive(ALIVE_PID) → true → false (not stale) — WRONG.
    const state = makeRunningState({ pid: null });
    // Simulate legacy state schema by removing jobId
    (state as unknown as Record<string, unknown>)["jobId"] = undefined;

    mockSidecarContent({ pid: ALIVE_PID, jobId: "job-A" });

    const result = isStaleRunning(state, SIDECAR_PATH);
    expect(result).toBe(true);
  });
});
