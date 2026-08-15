/**
 * TC-009: --from test-materialize は implementer に解決される
 * TC-010: resumePoint.step が test-materialize でも implementer に解決される
 * TC-011: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない
 *
 * Source: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される
 *         > Scenario: --from test-materialize は implementer に解決される
 *         > Scenario: resumePoint.step が test-materialize でも implementer に解決される
 *         > Scenario: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない
 */
import { describe, it, expect } from "vitest";
import { resolveResumeStep } from "../resolve-step.js";
import { validateJobState } from "../../../state/schema/operations.js";
import { fold } from "../../../store/event-journal.js";
import type { ResumePoint } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResumePoint(step: string): ResumePoint {
  return { step, reason: "timeout", iterationsExhausted: 2 };
}

// ---------------------------------------------------------------------------
// TC-009: --from test-materialize は implementer に解決される
// ---------------------------------------------------------------------------

describe("TC-009: --from test-materialize resolves to implementer (legacy alias)", () => {
  it("TC-009: resolveResumeStep('test-materialize', null, undefined) → 'implementer'", () => {
    // After absorb-test-materialize: test-materialize is removed from AGENT_STEP_NAMES
    // and added to LEGACY_STEP_ALIASES → maps to STEP_NAMES.IMPLEMENTER.
    const result = resolveResumeStep("test-materialize", null, undefined);
    expect(result).toBe("implementer");
  });

  it("TC-009: --from test-materialize does NOT throw (is resolved via alias, not invalid)", () => {
    // Must not throw "Invalid --from value"
    expect(() => resolveResumeStep("test-materialize", null, undefined)).not.toThrow();
  });

  it("TC-009: --from test-materialize wins over resumePoint (priority 1 over priority 3)", () => {
    // --from has highest priority; even with a resumePoint, --from wins.
    const rp = makeResumePoint("design");
    const result = resolveResumeStep("test-materialize", rp, "design");
    expect(result).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-010: resumePoint.step が test-materialize でも implementer に解決される
// ---------------------------------------------------------------------------

describe("TC-010: resumePoint.step='test-materialize' resolves to implementer", () => {
  it("TC-010: resolveResumeStep(undefined, { step: 'test-materialize' }, undefined) → 'implementer'", () => {
    // After absorb-test-materialize: LEGACY_STEP_ALIASES maps test-materialize → implementer.
    const rp = makeResumePoint("test-materialize");
    const result = resolveResumeStep(undefined, rp, undefined);
    expect(result).toBe("implementer");
  });

  it("TC-010: resumePoint.step='test-materialize' with stateStep provided → implementer wins", () => {
    // resumePoint takes priority over stateStep; alias maps test-materialize → implementer.
    const rp = makeResumePoint("test-materialize");
    const result = resolveResumeStep(undefined, rp, "design");
    expect(result).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-011: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない
// ---------------------------------------------------------------------------

describe("TC-011: legacy state with test-materialize history loads and folds without error", () => {
  it("TC-011: validateJobState accepts state.steps with test-materialize runs", () => {
    // StepName = string → any key in steps is valid.
    // test-materialize history must be preserved (passthrough) in normalized steps.
    const raw = {
      version: 2,
      jobId: "legacy-test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: "specrunner/changes/example/request.md",
        title: "Example",
        type: "bug-fix",
        slug: "example",
      },
      repository: { owner: "octo", name: "repo" },
      session: null,
      step: "implementer",
      status: "running",
      branch: "change/example-abc12345",
      history: [],
      error: null,
      steps: {
        "test-materialize": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:01:00.000Z",
            endedAt: "2026-01-01T00:02:00.000Z",
            commitOid: "mat-sha-legacy-001",
          },
        ],
        "implementer": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:02:00.000Z",
            endedAt: "2026-01-01T00:03:00.000Z",
            commitOid: "impl-sha-legacy-001",
          },
        ],
      },
    };

    // Must not throw
    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    // test-materialize history is preserved as passthrough
    expect(state.steps?.["test-materialize"]).toBeDefined();
    expect(state.steps?.["test-materialize"]).toHaveLength(1);
  });

  it("TC-011: fold() of JSONL with test-materialize step-attempt records does not corrupt", () => {
    // The fold() function groups step-attempt records by step name regardless of step name.
    // Unknown step names are passed through (StepName = string).
    const record1 = JSON.stringify({
      type: "step-attempt",
      step: "test-materialize",
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:02:00.000Z",
      commitOid: "mat-sha-fold-001",
    });
    const record2 = JSON.stringify({
      type: "step-attempt",
      step: "implementer",
      sessionId: null,
      outcome: { verdict: "success", findingsPath: null, error: null },
      startedAt: "2026-01-01T00:02:00.000Z",
      endedAt: "2026-01-01T00:03:00.000Z",
      commitOid: "impl-sha-fold-001",
    });
    const record3 = JSON.stringify({
      type: "transition",
      from: "test-materialize",
      to: "implementer",
      on: "success",
      ts: "2026-01-01T00:02:00.000Z",
    });

    const content = [record1, record2, record3].join("\n");
    const result = fold(content);

    // No corruption
    expect(result.corruption).toBeUndefined();
    // test-materialize records are preserved in steps
    expect(result.steps["test-materialize"]).toBeDefined();
    expect(result.steps["test-materialize"]).toHaveLength(1);
    // implementer records are preserved
    expect(result.steps["implementer"]).toHaveLength(1);
  });

  it("TC-011: validateJobState with legacy test-materialize steps preserves the commitOid", () => {
    const matCommitOid = "mat-legacy-oid-tc011";
    const raw = {
      version: 2,
      jobId: "legacy-oid-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: "specrunner/changes/example/request.md",
        title: "Example",
        type: "bug-fix",
        slug: "example",
      },
      repository: { owner: "octo", name: "repo" },
      session: null,
      step: "implementer",
      status: "running",
      branch: "change/example-abc12345",
      history: [],
      error: null,
      steps: {
        "test-materialize": [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T00:01:00.000Z",
            endedAt: "2026-01-01T00:02:00.000Z",
            commitOid: matCommitOid,
          },
        ],
      },
    };

    const state = validateJobState(raw);
    // commitOid is preserved on the StepRun record (passthrough)
    const matRun = state.steps?.["test-materialize"]?.[0];
    expect(matRun).toBeDefined();
    expect((matRun as unknown as Record<string, unknown>)["commitOid"]).toBe(matCommitOid);
  });
});
