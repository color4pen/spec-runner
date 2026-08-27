/**
 * TC-002, TC-016, TC-017 — FSM guard for the awaiting-archive → awaiting-resume reopen edge.
 *
 * TC-002: The general transition guard (canTransition / transitionJob without opts) still
 *         forbids awaiting-archive → running. This pins the invariant that widening
 *         VALID_TRANSITIONS is NOT part of this change.
 *
 * TC-016: transitionJob with { allowReopen: true } succeeds for awaiting-archive → awaiting-resume.
 *         Tests the new REOPEN_TRANSITIONS table and the optional 4th argument on transitionJob.
 *
 * TC-017: transitionJob without the allowReopen opt-in throws for awaiting-archive → running.
 *         Pins the default (no-opts) path that resume and all other callers rely on.
 *         Also asserts canTransition("awaiting-archive", "awaiting-resume") returns false
 *         (general guard; TC-017-d).
 *
 * Source: spec.md › Requirement: reopen transitions an awaiting-archive job to awaiting-resume
 *         tasks.md T-01
 */
import { describe, it, expect } from "vitest";
import { canTransition, transitionJob } from "../../state/lifecycle.js";
import type { JobState, JobStatus } from "../../state/schema.js";
import type { TransitionContext, TransitionResult } from "../../state/lifecycle.js";

// ---------------------------------------------------------------------------
// Type cast for the post-implementation transitionJob signature.
// After T-01, transitionJob will accept an optional 4th opts parameter.
// Using a cast through unknown avoids a TypeScript error until the implementation
// adds the parameter, while still allowing the test to call it and fail the
// assertion (instead of failing at parse time).
// ---------------------------------------------------------------------------
type TransitionJobOpts = { allowReopen?: boolean };
type TransitionJobWithOpts = (
  state: JobState,
  to: JobStatus,
  ctx: TransitionContext,
  opts?: TransitionJobOpts,
) => TransitionResult;

const transitionJobWithOpts = transitionJob as unknown as TransitionJobWithOpts;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAwaitingArchiveState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-abc123",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "fix/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

const REOPEN_CTX: TransitionContext = {
  trigger: "reopen",
  reason: "post-review fix",
};

// ---------------------------------------------------------------------------
// TC-002: general transition guard forbids awaiting-archive → running
// ---------------------------------------------------------------------------

describe("TC-002: general FSM guard still forbids awaiting-archive → running", () => {
  it("TC-002-a: canTransition('awaiting-archive', 'running') returns false", () => {
    // VALID_TRANSITIONS must NOT be widened by this change.
    // The reopen edge lives only in REOPEN_TRANSITIONS.
    expect(canTransition("awaiting-archive", "running")).toBe(false);
  });

  it("TC-002-b: transitionJob without opts throws for awaiting-archive → running", () => {
    // The default (no-opts) path that resume uses must still throw.
    const state = makeAwaitingArchiveState();
    expect(() => transitionJobWithOpts(state, "running", REOPEN_CTX)).toThrow();
    // The state should be unchanged (pure function — no mutation)
    expect(state.status).toBe("awaiting-archive");
  });

  it("TC-002-c: REOPEN_TRANSITIONS export exists with awaiting-archive → awaiting-resume edge", async () => {
    // After T-01: lifecycle.ts must export REOPEN_TRANSITIONS with awaiting-resume as target.
    const module = await import("../../state/lifecycle.js");
    const table = (module as Record<string, unknown>)["REOPEN_TRANSITIONS"];
    expect(table).toBeDefined();
    const targets = (table as Map<string, Set<string>>).get("awaiting-archive");
    expect(targets).toBeDefined();
    expect(targets!.has("awaiting-resume")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016: transitionJob with allowReopen:true succeeds for awaiting-archive → awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-016: transitionJob with { allowReopen: true } succeeds for awaiting-archive → awaiting-resume", () => {
  it("TC-016: returns state with status='awaiting-resume' and appends a history entry", () => {
    // GIVEN a JobState with status awaiting-archive
    const state = makeAwaitingArchiveState();
    const initialHistoryLength = state.history.length;

    // WHEN transitionJob(state, "awaiting-resume", ctx, { allowReopen: true }) is called
    const result = transitionJobWithOpts(state, "awaiting-resume", REOPEN_CTX, { allowReopen: true });

    // THEN the returned state has status awaiting-resume
    expect(result.state.status).toBe("awaiting-resume");
    // AND a history entry is appended
    expect(result.state.history.length).toBeGreaterThan(initialHistoryLength);
    // AND noop is false
    expect(result.noop).toBe(false);
  });

  it("TC-016-b: allowReopen:false still throws (default behaviour preserved)", () => {
    const state = makeAwaitingArchiveState();
    expect(() => transitionJobWithOpts(state, "awaiting-resume", REOPEN_CTX, { allowReopen: false })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-017: transitionJob without allowReopen throws for awaiting-archive → running
// Also: TC-017-d — canTransition("awaiting-archive", "awaiting-resume") returns false
// ---------------------------------------------------------------------------

describe("TC-017: transitionJob without allowReopen throws for awaiting-archive → running", () => {
  it("TC-017-a: throws when no opts are passed (default caller path)", () => {
    const state = makeAwaitingArchiveState();
    // This must throw — resume, assertJobFinishable, and exit-guard rely on this
    expect(() => transitionJobWithOpts(state, "running", REOPEN_CTX)).toThrow();
  });

  it("TC-017-b: state status is unchanged after the failed transition attempt (pure function guarantee)", () => {
    const state = makeAwaitingArchiveState();
    try {
      transitionJobWithOpts(state, "running", REOPEN_CTX);
    } catch {
      // expected
    }
    // Pure function — original state must not be mutated
    expect(state.status).toBe("awaiting-archive");
  });

  it("TC-017-c: canTransition returns false (guard driving resume rejection)", () => {
    // This is the guard that ResumeCommand.prepare() checks at line 155.
    // It must remain false so that the resume path stays blocked.
    expect(canTransition("awaiting-archive", "running")).toBe(false);
  });

  it("TC-017-d: canTransition('awaiting-archive', 'awaiting-resume') returns false", () => {
    // General guard still forbids awaiting-archive → awaiting-resume without opt-in.
    // The REOPEN_TRANSITIONS table is separate from VALID_TRANSITIONS.
    expect(canTransition("awaiting-archive", "awaiting-resume")).toBe(false);
  });
});
