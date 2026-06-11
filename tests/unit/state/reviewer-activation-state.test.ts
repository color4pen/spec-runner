/**
 * T-05: state / snapshot / event-journal round-trip tests for reviewer activation.
 *
 * Verifies:
 * - verdict: "skipped" + skipReason round-trips through pushStepResult → state.steps
 * - paths/requestTypes in ReviewerSnapshot survive validateJobState
 * - stepRunToRecord / fold preserve skipReason
 */
import { describe, it, expect } from "vitest";
import { pushStepResult } from "../../../src/state/helpers.js";
import { validateJobState } from "../../../src/state/schema.js";
import { stepRunToRecord, fold } from "../../../src/store/event-journal.js";
import type { JobState } from "../../../src/state/schema.js";

function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

// ---------------------------------------------------------------------------
// T-05a: skipped verdict round-trip in state
// ---------------------------------------------------------------------------

describe("T-05: skipped verdict persists through pushStepResult", () => {
  it("stores verdict: skipped + skipReason in outcome", () => {
    const state = makeBaseState();
    const now = new Date().toISOString();
    const updated = pushStepResult(state, "security", {
      session: null,
      verdict: "skipped",
      findingsPath: null,
      completedAt: now,
      startedAt: now,
      error: null,
      skipReason: "requestType \"bug-fix\" is not in [spec-change]",
    });
    const run = updated.steps?.["security"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.skipReason).toBe('requestType "bug-fix" is not in [spec-change]');
  });

  it("skipReason absent in outcome when not provided", () => {
    const state = makeBaseState();
    const updated = pushStepResult(state, "security", {
      session: null,
      verdict: "approved",
      findingsPath: null,
      error: null,
    });
    const run = updated.steps?.["security"]?.[0];
    expect(run?.outcome.verdict).toBe("approved");
    expect(run?.outcome.skipReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-05b: paths/requestTypes in ReviewerSnapshot survive validateJobState
// ---------------------------------------------------------------------------

describe("T-05: paths/requestTypes in ReviewerSnapshot round-trip via validateJobState", () => {
  it("accepts reviewer snapshot with paths and requestTypes", () => {
    const raw = {
      ...makeBaseState(),
      reviewers: [
        {
          name: "security",
          maxIterations: 3,
          purpose: "p",
          criteria: "c",
          judgment: "j",
          freeText: "",
          paths: ["src/auth/**"],
          requestTypes: ["new-feature"],
        },
      ],
    };
    const validated = validateJobState(raw);
    expect(validated.reviewers?.[0]?.["paths"]).toEqual(["src/auth/**"]);
    expect(validated.reviewers?.[0]?.["requestTypes"]).toEqual(["new-feature"]);
  });

  it("rejects reviewer snapshot with non-array paths", () => {
    const raw = {
      ...makeBaseState(),
      reviewers: [
        {
          name: "security",
          maxIterations: 3,
          purpose: "p",
          criteria: "c",
          judgment: "j",
          freeText: "",
          paths: "src/auth/**",
        },
      ],
    };
    expect(() => validateJobState(raw)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// T-05c: skipReason threads through stepRunToRecord and fold
// ---------------------------------------------------------------------------

describe("T-05: skipReason round-trips through event journal fold", () => {
  it("fold preserves skipReason from StepAttemptRecord", () => {
    const record = {
      type: "step-attempt" as const,
      step: "security",
      sessionId: null,
      outcome: {
        verdict: "skipped" as const,
        findingsPath: null,
        error: null,
        skipReason: "no changed files matched paths [src/auth/**]",
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    };

    const content = JSON.stringify(record) + "\n";
    const result = fold(content);
    const run = result.steps["security"]?.[0];
    expect(run?.outcome.verdict).toBe("skipped");
    expect(run?.outcome.skipReason).toBe("no changed files matched paths [src/auth/**]");
  });

  it("stepRunToRecord includes skipReason when present", () => {
    const run = {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "skipped" as const,
        findingsPath: null,
        error: null,
        skipReason: "requestType mismatch",
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    };
    const record = stepRunToRecord("security", run);
    expect(record.outcome.skipReason).toBe("requestType mismatch");
  });

  it("stepRunToRecord omits skipReason when absent", () => {
    const run = {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "approved" as const,
        findingsPath: null,
        error: null,
      },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    };
    const record = stepRunToRecord("security", run);
    expect(record.outcome.skipReason).toBeUndefined();
  });
});
