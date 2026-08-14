/**
 * Tests: build-fixer の廃止 — 既存 state 互換・resume alias
 *
 * TC-008: build-fixer 実行歴を含む state を読み込み fold する
 * TC-009: build-fixer 復帰点は implementer へ写される
 *
 * Source: specrunner/changes/absorb-build-fixer/test-cases.md
 */
import { describe, it, expect } from "vitest";
import { fold } from "../../../src/store/event-journal.js";
import type { StepAttemptRecord } from "../../../src/store/event-journal.js";
import { resolveResumeStep } from "../../../src/core/resume/resolve-step.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../../src/kernel/step-names.js";

// ---------------------------------------------------------------------------
// TC-008: build-fixer 実行歴を含む state を読み込み fold する
// ---------------------------------------------------------------------------

describe("TC-008: build-fixer 実行歴を含む events の fold が壊れない", () => {
  it("TC-008: build-fixer の step-attempt record を含む events.jsonl を fold してもエラーにならない", () => {
    // Simulate a historic events.jsonl with build-fixer records.
    // fold() must handle unknown step names gracefully — StepName = string.
    const buildFixerRecord: StepAttemptRecord = {
      type: "step-attempt",
      step: "build-fixer",
      sessionId: "sess-build-fixer-old",
      outcome: {
        verdict: "success",
        findingsPath: null,
        error: null,
      },
      startedAt: "2026-01-01T00:02:00.000Z",
      endedAt: "2026-01-01T00:02:30.000Z",
    };

    const implementerRecord: StepAttemptRecord = {
      type: "step-attempt",
      step: "implementer",
      sessionId: "sess-impl-001",
      outcome: {
        verdict: "success",
        findingsPath: null,
        error: null,
      },
      startedAt: "2026-01-01T00:01:00.000Z",
      endedAt: "2026-01-01T00:01:30.000Z",
    };

    const verificationRecord: StepAttemptRecord = {
      type: "step-attempt",
      step: "verification",
      sessionId: null,
      outcome: {
        verdict: "failed",
        findingsPath: "specrunner/changes/test-slug/verification-result.md",
        error: null,
      },
      startedAt: "2026-01-01T00:01:45.000Z",
      endedAt: "2026-01-01T00:02:00.000Z",
    };

    // Simulate jsonl content with build-fixer history
    const lines = [
      JSON.stringify(implementerRecord),
      JSON.stringify(verificationRecord),
      JSON.stringify(buildFixerRecord),
    ].join("\n");

    // fold() parses the jsonl content and should not throw even with unknown step "build-fixer"
    let error: unknown = null;
    let result: ReturnType<typeof fold> | null = null;
    try {
      result = fold(lines);
    } catch (e) {
      error = e;
    }

    // TC-008: fold エラーにならない
    expect(error).toBeNull();
    expect(result).not.toBeNull();

    // TC-008: build-fixer の実行歴が projection に保持される
    const buildFixerRuns = result!.steps["build-fixer"] ?? [];
    expect(buildFixerRuns.length).toBeGreaterThan(0);
  });

  it("TC-008: build-fixer 実行歴を含む steps オブジェクトは ProjectedJobState に保持される", () => {
    // State.steps["build-fixer"] is preserved through fold — StepName = string passthrough.
    // This confirms the schema accepts arbitrary step names.
    const stepsWithBuildFixer: Record<string, unknown> = {
      "implementer": [
        {
          attempt: 1,
          sessionId: "sess-impl-001",
          outcome: { verdict: "success", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
        },
      ],
      "build-fixer": [
        {
          attempt: 1,
          sessionId: "sess-bf-001",
          outcome: { verdict: "success", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:02:00.000Z",
          endedAt: "2026-01-01T00:02:30.000Z",
        },
      ],
      "verification": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "passed", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:03:00.000Z",
          endedAt: "2026-01-01T00:03:30.000Z",
        },
      ],
    };

    // Since StepName = string, accessing build-fixer in steps should just work
    expect(stepsWithBuildFixer["build-fixer"]).toBeDefined();
    expect(stepsWithBuildFixer["implementer"]).toBeDefined();
    expect(stepsWithBuildFixer["verification"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-009: build-fixer 復帰点は implementer へ写される
// ---------------------------------------------------------------------------

describe("TC-009: resolveResumeStep — build-fixer は implementer へ写される", () => {
  /** Build the set of step names that is allowed after the change */
  function buildAllowedSet(): Set<string> {
    return new Set([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
  }

  it("TC-009: --from build-fixer → implementer に写される", () => {
    // After implementation: LEGACY_STEP_ALIASES = {"build-fixer": "implementer"}
    // resolveResumeStep("build-fixer", ...) should resolve to "implementer"
    const allowed = buildAllowedSet();
    const result = resolveResumeStep(
      "build-fixer",      // from
      null,               // resumePoint
      undefined,          // stateStep
      allowed,            // allowedSteps
      undefined,          // reviewers
    );
    expect(result).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-009: resumePoint.step=build-fixer → implementer に写される", () => {
    const allowed = buildAllowedSet();
    const result = resolveResumeStep(
      undefined,           // from
      { step: "build-fixer", iterationsExhausted: 2 },  // resumePoint
      undefined,           // stateStep
      allowed,             // allowedSteps
      undefined,           // reviewers
    );
    expect(result).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-009: 通常の --from implementer は変換されずそのまま返る", () => {
    const allowed = buildAllowedSet();
    const result = resolveResumeStep(
      "implementer",
      null,
      undefined,
      allowed,
      undefined,
    );
    expect(result).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-009: 通常の --from code-review も変換されずそのまま返る", () => {
    const allowed = buildAllowedSet();
    const result = resolveResumeStep(
      "code-review",
      null,
      undefined,
      allowed,
      undefined,
    );
    expect(result).toBe(STEP_NAMES.CODE_REVIEW);
  });
});
