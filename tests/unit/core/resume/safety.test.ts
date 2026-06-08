/**
 * Tests for safety checks in src/core/resume/safety.ts
 *
 * checkConsecutiveEscalations:
 *   - 0 runs → false
 *   - 1 escalation, threshold=3 → false (not enough)
 *   - 2 escalations, threshold=3 → false
 *   - 3 escalations, threshold=3 → true
 *   - 3 escalations but last is approved → false
 *   - mixed verdicts in last N → false
 *
 * checkStaleState:
 *   - updatedAt 1 hour ago → false (within threshold)
 *   - updatedAt 25 hours ago → true (beyond threshold)
 *   - updatedAt exactly threshold → false (boundary: not strictly greater)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkConsecutiveEscalations, checkStaleState, isProcessAlive, isStaleRunning } from "../../../../src/core/resume/safety.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "code-review",
    status: "awaiting-resume",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStepRun(verdict: "escalation" | "error" | "approved" | "needs-fix", attempt = 1): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("checkConsecutiveEscalations", () => {
  it("returns false when no steps recorded for the step", () => {
    const state = makeBaseState({ steps: {} });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("returns false when steps field is missing", () => {
    const state = makeBaseState();
    delete state.steps;
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("returns false with 0 runs", () => {
    const state = makeBaseState({ steps: { "code-review": [] } });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("returns false with 1 escalation (below threshold=3)", () => {
    const state = makeBaseState({
      steps: { "code-review": [makeStepRun("escalation", 1)] },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("returns false with 2 escalations (below threshold=3)", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("escalation", 2),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("returns true with 3 consecutive escalations (threshold=3)", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("escalation", 2),
          makeStepRun("escalation", 3),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(true);
  });

  it("returns true when last 3 are escalation (more than 3 total)", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("approved", 1),
          makeStepRun("escalation", 2),
          makeStepRun("escalation", 3),
          makeStepRun("escalation", 4),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(true);
  });

  it("returns false when 3 total but last is not escalation", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("escalation", 2),
          makeStepRun("approved", 3),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(false);
  });

  it("treats 'error' verdict the same as 'escalation'", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("error", 1),
          makeStepRun("error", 2),
          makeStepRun("error", 3),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(true);
  });

  it("returns true with mixed escalation and error in last 3", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [
          makeStepRun("escalation", 1),
          makeStepRun("error", 2),
          makeStepRun("escalation", 3),
        ],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review")).toBe(true);
  });

  it("custom threshold=1: 1 escalation returns true", () => {
    const state = makeBaseState({
      steps: {
        "code-review": [makeStepRun("escalation", 1)],
      },
    });
    expect(checkConsecutiveEscalations(state, "code-review", 1)).toBe(true);
  });
});

describe("checkStaleState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when updatedAt is 1 hour ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const oneHourAgo = new Date("2026-01-02T11:00:00.000Z").toISOString();
    const state = makeBaseState({ updatedAt: oneHourAgo });
    expect(checkStaleState(state)).toBe(false);
  });

  it("returns true when updatedAt is 25 hours ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const twentyFiveHoursAgo = new Date("2026-01-01T11:00:00.000Z").toISOString();
    const state = makeBaseState({ updatedAt: twentyFiveHoursAgo });
    expect(checkStaleState(state)).toBe(true);
  });

  it("returns false when updatedAt is exactly at threshold (not strictly greater)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    // Exactly 24 hours ago — should return false (boundary: > threshold, not >=)
    const exactly24HoursAgo = new Date(now.getTime() - 86400000).toISOString();
    const state = makeBaseState({ updatedAt: exactly24HoursAgo });
    expect(checkStaleState(state)).toBe(false);
  });

  it("returns true when updatedAt is 1ms past threshold", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const justPastThreshold = new Date(now.getTime() - 86400001).toISOString();
    const state = makeBaseState({ updatedAt: justPastThreshold });
    expect(checkStaleState(state)).toBe(true);
  });

  it("uses custom threshold", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    // 2 hours ago, threshold=1 hour
    const twoHoursAgo = new Date(now.getTime() - 7200000).toISOString();
    const state = makeBaseState({ updatedAt: twoHoursAgo });
    expect(checkStaleState(state, 3600000)).toBe(true);
  });
});

describe("isProcessAlive", () => {
  it("returns true for the current process PID", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a PID that does not exist (999999)", () => {
    // PID 999999 is extremely unlikely to exist
    expect(isProcessAlive(999999)).toBe(false);
  });

  it("returns false for invalid PID 0", () => {
    // PID 0 sends signal to the process group; treat as invalid → false
    expect(isProcessAlive(0)).toBe(false);
  });

  it("returns false for negative PID", () => {
    expect(isProcessAlive(-1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStaleRunning — sidecar pid typeof guard (T2.3 regression: D8)
// ---------------------------------------------------------------------------

describe("isStaleRunning — sidecar pid typeof guard", () => {
  it("treats sidecar pid as absent (stale) when pid is a string", async () => {
    // Write a temporary sidecar with pid as a string (not a number)
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "safety-test-"));
    try {
      const sidecarPath = path.join(tmpDir, "liveness.json");
      await writeFile(sidecarPath, JSON.stringify({ pid: "123", jobId: "test-job" }));

      const state = makeBaseState({ status: "running" });
      // pid is a string → typeof pid !== "number" → sidecar pid is treated as absent → stale
      const result = isStaleRunning(state, sidecarPath);
      expect(result).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("treats sidecar pid as absent (stale) when pid field is missing", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "safety-test-"));
    try {
      const sidecarPath = path.join(tmpDir, "liveness.json");
      await writeFile(sidecarPath, JSON.stringify({ jobId: "test-job" }));

      const state = makeBaseState({ status: "running" });
      // No pid field → sidecar present but no pid → stale
      const result = isStaleRunning(state, sidecarPath);
      expect(result).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("isStaleRunning", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRunningState(overrides: Partial<JobState> = {}): JobState {
    return makeBaseState({ status: "running", ...overrides });
  }

  it("returns false when status is not 'running'", () => {
    const state = makeBaseState({ status: "awaiting-resume" });
    expect(isStaleRunning(state)).toBe(false);
  });

  it("returns false when status is 'running' and pid is the current process (alive)", () => {
    const state = makeRunningState({ pid: process.pid });
    expect(isStaleRunning(state)).toBe(false);
  });

  it("returns true when status is 'running' and pid does not exist (dead process)", () => {
    const state = makeRunningState({ pid: 999999 });
    expect(isStaleRunning(state)).toBe(true);
  });

  it("returns true when status is 'running', no pid, and updatedAt is 16 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000).toISOString();
    const state = makeRunningState({ pid: undefined, updatedAt: sixteenMinutesAgo });
    expect(isStaleRunning(state)).toBe(true);
  });

  it("returns false when status is 'running', no pid, and updatedAt is 5 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const state = makeRunningState({ pid: undefined, updatedAt: fiveMinutesAgo });
    expect(isStaleRunning(state)).toBe(false);
  });

  it("returns false when status is 'running', no pid, and updatedAt is exactly 15 minutes ago (boundary)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-02T12:00:00.000Z");
    vi.setSystemTime(now);

    const exactly15MinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const state = makeRunningState({ pid: undefined, updatedAt: exactly15MinutesAgo });
    // Boundary: elapsed === threshold, not strictly greater → false
    expect(isStaleRunning(state)).toBe(false);
  });
});
