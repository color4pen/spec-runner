/**
 * Tests for transientRetryAttempts in state helpers and event journal.
 *
 * T-07 / T-08 acceptance criteria:
 *   - pushStepResult with transientRetryAttempts=2 → outcome has the value
 *   - pushStepResult without transientRetryAttempts → key absent (backward compat)
 *   - stepRunToRecord serialises transientRetryAttempts
 *   - fold() restores transientRetryAttempts from journal
 *   - fold() on legacy journal (no field) → field absent in StepRun
 */
import { describe, it, expect } from "vitest";
import { pushStepResult } from "../helpers.js";
import { stepRunToRecord, fold } from "../../store/event-journal.js";
import type { JobState } from "../schema.js";

// ---------------------------------------------------------------------------
// Minimal state fixture
// ---------------------------------------------------------------------------

function makeState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// T-07: pushStepResult with transientRetryAttempts
// ---------------------------------------------------------------------------

describe("pushStepResult — transientRetryAttempts (T-07)", () => {
  it("transientRetryAttempts=2 is recorded in outcome (T-07 AC1)", () => {
    const state = makeState();
    const result = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
      transientRetryAttempts: 2,
    });

    const run = result.steps?.["design"]?.[0];
    expect(run).toBeDefined();
    expect(run!.outcome.transientRetryAttempts).toBe(2);
  });

  it("transientRetryAttempts=0 is recorded", () => {
    const state = makeState();
    const result = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
      transientRetryAttempts: 0,
    });

    const run = result.steps?.["design"]?.[0];
    expect(run!.outcome.transientRetryAttempts).toBe(0);
  });

  it("transientRetryAttempts absent → key not present in outcome (backward compat, T-07 AC2)", () => {
    const state = makeState();
    const result = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
      // transientRetryAttempts intentionally omitted
    });

    const run = result.steps?.["design"]?.[0];
    expect(run).toBeDefined();
    expect("transientRetryAttempts" in run!.outcome).toBe(false);
  });

  it("transientRetryAttempts=undefined → key not present in outcome", () => {
    const state = makeState();
    const result = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
      transientRetryAttempts: undefined,
    });

    const run = result.steps?.["design"]?.[0];
    expect("transientRetryAttempts" in run!.outcome).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-08: stepRunToRecord serialises transientRetryAttempts
// ---------------------------------------------------------------------------

describe("stepRunToRecord — transientRetryAttempts (T-08)", () => {
  it("transientRetryAttempts=2 is written to record (T-08 AC1)", () => {
    const state = makeState();
    const withResult = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
      transientRetryAttempts: 2,
    });
    const run = withResult.steps!["design"]![0]!;
    const record = stepRunToRecord("design", run);

    expect(record.outcome.transientRetryAttempts).toBe(2);
  });

  it("transientRetryAttempts absent in run → absent in record", () => {
    const state = makeState();
    const withResult = pushStepResult(state, "design", {
      verdict: "approved",
      findingsPath: null,
      error: null,
    });
    const run = withResult.steps!["design"]![0]!;
    const record = stepRunToRecord("design", run);

    expect("transientRetryAttempts" in record.outcome).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-08: fold() restores transientRetryAttempts from journal
// ---------------------------------------------------------------------------

describe("fold() — transientRetryAttempts (T-08)", () => {
  it("fold restores transientRetryAttempts=2 from journal line (T-08 AC2)", () => {
    const line = JSON.stringify({
      type: "step-attempt",
      step: "design",
      sessionId: null,
      outcome: {
        verdict: "approved",
        findingsPath: null,
        error: null,
        transientRetryAttempts: 2,
      },
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const result = fold(line);
    const run = result.steps["design"]?.[0];
    expect(run).toBeDefined();
    expect(run!.outcome.transientRetryAttempts).toBe(2);
  });

  it("fold on legacy journal line (no field) → field absent (T-08 AC3)", () => {
    const line = JSON.stringify({
      type: "step-attempt",
      step: "design",
      sessionId: null,
      outcome: {
        verdict: "approved",
        findingsPath: null,
        error: null,
        // transientRetryAttempts absent — legacy record
      },
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const result = fold(line);
    const run = result.steps["design"]?.[0];
    expect(run).toBeDefined();
    expect("transientRetryAttempts" in run!.outcome).toBe(false);
  });

  it("fold with followUpAttempts and transientRetryAttempts together", () => {
    const line = JSON.stringify({
      type: "step-attempt",
      step: "implementer",
      sessionId: "sess-1",
      outcome: {
        verdict: "success",
        findingsPath: null,
        error: null,
        followUpAttempts: 1,
        transientRetryAttempts: 3,
      },
      startedAt: "2026-01-01T00:00:00Z",
      endedAt: "2026-01-01T00:01:00Z",
    });

    const result = fold(line);
    const run = result.steps["implementer"]?.[0];
    expect(run!.outcome.followUpAttempts).toBe(1);
    expect(run!.outcome.transientRetryAttempts).toBe(3);
  });
});
