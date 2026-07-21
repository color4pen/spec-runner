/**
 * Tests for backward compatibility with legacy request-review records without evidence.
 *
 * Source: spec.md > Requirement: past request-review records without evidence MUST remain readable and resumable
 *
 * TC-009: evidence 無しの旧 StepRun レコードが読み取りエラーなく処理される
 * TC-010: evidence 無しの旧 record を含む job の resume が正常に進む
 */
import { describe, it, expect } from "vitest";
import { getLatestStepResult } from "../../../state/helpers.js";
import type { JobState } from "../../../state/schema.js";
import type { StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helper: build a legacy request-review StepRun WITHOUT evidence
// ---------------------------------------------------------------------------

/** Create a legacy request-review StepRun that predates the evidence requirement. */
function makeLegacyRequestReviewRun(verdict: string): StepRun {
  return {
    attempt: 1,
    sessionId: "sess-legacy-request-review-001",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:05:00.000Z",
    outcome: {
      verdict: verdict as import("../../../state/schema.js").Verdict,
      findingsPath: null,
      error: null,
      toolResult: {
        ok: true,
        // NOTE: intentionally NO evidence field — this is a legacy record
        // predating the evidence-counts requirement
      },
    },
  };
}

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "legacy-compat-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "specrunner/changes/test/request.md", title: "Test", type: "bug-fix", slug: "test" },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: "change/test-abc123",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-009: evidence 無しの旧 StepRun レコードが読み取りエラーなく処理される
// Source: spec.md > Requirement: past request-review records without evidence MUST remain readable and resumable
//         > Scenario: legacy request-review record without evidence is read without error
// ---------------------------------------------------------------------------

describe("TC-009: evidence 無しの旧 StepRun レコードが読み取りエラーなく処理される", () => {
  it("TC-009: getLatestStepResult succeeds on state with legacy request-review record (no evidence)", () => {
    const legacyRun = makeLegacyRequestReviewRun("approve");
    const state = makeBaseState({
      step: "design",
      steps: { "request-review": [legacyRun] },
    });

    expect(() => {
      getLatestStepResult(state, "request-review");
    }).not.toThrow();

    const result = getLatestStepResult(state, "request-review");
    expect(result).toBeDefined();
    expect(result?.verdict).toBe("approve");
  });

  it("TC-009: reading verdict from legacy request-review run returns the persisted verdict without re-derivation", () => {
    const legacyApproveRun = makeLegacyRequestReviewRun("approve");
    const state = makeBaseState({
      steps: { "request-review": [legacyApproveRun] },
    });

    const result = getLatestStepResult(state, "request-review");
    // The persisted verdict is returned as-is; no re-derivation on read
    expect(result?.verdict).toBe("approve");
  });

  it("TC-009: reading needs-discussion verdict from legacy record works without error", () => {
    const legacyRun = makeLegacyRequestReviewRun("needs-discussion");
    const state = makeBaseState({
      steps: { "request-review": [legacyRun] },
    });

    expect(() => {
      getLatestStepResult(state, "request-review");
    }).not.toThrow();

    const result = getLatestStepResult(state, "request-review");
    expect(result?.verdict).toBe("needs-discussion");
  });

  it("TC-009: accessing evidence field on legacy toolResult returns undefined (not throw)", () => {
    const legacyRun = makeLegacyRequestReviewRun("approve");
    const state = makeBaseState({
      steps: { "request-review": [legacyRun] },
    });

    const runs = state.steps?.["request-review"] ?? [];
    expect(runs).toHaveLength(1);

    const toolResult = runs[0]?.outcome.toolResult;
    // evidence field was not set — accessing it should return undefined, not throw
    const evidence = toolResult && "evidence" in toolResult
      ? (toolResult as unknown as { evidence?: unknown }).evidence
      : undefined;
    expect(evidence).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-010: evidence 無しの旧 record を含む job の resume が正常に進む
// Source: spec.md > Requirement: past request-review records without evidence MUST remain readable and resumable
//         > Scenario: resume with legacy request-review records proceeds
// ---------------------------------------------------------------------------

describe("TC-010: evidence 無しの旧 record を含む job の resume が正常に進む", () => {
  it("TC-010: job state with legacy request-review step (no evidence) can be read and iterated", () => {
    const legacyRun = makeLegacyRequestReviewRun("approve");
    const state = makeBaseState({
      step: "design",  // Job advanced to design step after request-review approved
      steps: {
        "request-review": [legacyRun],
      },
    });

    // Verify the state is valid and the legacy run is accessible
    expect(state.steps?.["request-review"]).toHaveLength(1);
    expect(() => getLatestStepResult(state, "request-review")).not.toThrow();

    // Simulate what resume does: iterate over the steps without throwing
    expect(() => {
      const allSteps = Object.keys(state.steps ?? {});
      for (const stepName of allSteps) {
        const runs = state.steps?.[stepName] ?? [];
        for (const run of runs) {
          // Access toolResult (may not have evidence — that's OK)
          const toolResult = run.outcome.toolResult;
          void toolResult;
        }
      }
    }).not.toThrow();
  });

  it("TC-010: multiple legacy request-review runs can all be iterated without error", () => {
    const legacyRuns: StepRun[] = [
      makeLegacyRequestReviewRun("needs-discussion"),
      { ...makeLegacyRequestReviewRun("approve"), attempt: 2 },
    ];
    const state = makeBaseState({
      steps: { "request-review": legacyRuns },
    });

    expect(() => {
      const runs = state.steps?.["request-review"] ?? [];
      for (const run of runs) {
        const toolResult = run.outcome.toolResult;
        void toolResult;
      }
    }).not.toThrow();

    // The latest result should be the second (approve) run
    const latest = getLatestStepResult(state, "request-review");
    expect(latest?.verdict).toBe("approve");
  });

  it("TC-010: job state with mixed legacy (no evidence) and new (with evidence) request-review runs is readable", () => {
    const legacyRun = makeLegacyRequestReviewRun("needs-discussion");
    const newRun: StepRun = {
      attempt: 2,
      sessionId: "sess-new-request-review",
      startedAt: "2026-01-02T00:00:00.000Z",
      endedAt: "2026-01-02T00:05:00.000Z",
      outcome: {
        verdict: "approve",
        findingsPath: null,
        error: null,
        toolResult: {
          ok: true,
          findings: [],
          // New run has evidence (post-implementation)
          evidence: { checked: 5, skipped: 0, unverified: 0 },
        },
      },
    };

    const state = makeBaseState({
      step: "design",
      steps: { "request-review": [legacyRun, newRun] },
    });

    expect(() => {
      getLatestStepResult(state, "request-review");
    }).not.toThrow();

    // Latest run should be the new (approve) one
    const latest = getLatestStepResult(state, "request-review");
    expect(latest?.verdict).toBe("approve");
  });
});
