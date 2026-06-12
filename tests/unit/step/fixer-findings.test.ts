/**
 * Unit tests for fixer findings injection in spec-fixer and code-fixer buildMessage.
 *
 * TC-FF-S-001: spec-fixer initial — findings in state → findings embedded in prompt (no findingsPath)
 * TC-FF-S-002: spec-fixer initial — no findings in state → findingsPath fallback
 * TC-FF-S-003: spec-fixer continuation — findings in state → findings embedded in continuation
 * TC-FF-S-004: spec-fixer continuation — no findings in state → findingsPath in continuation
 * TC-FF-C-001: code-fixer initial — findings in state → findings embedded in prompt (no findingsPath)
 * TC-FF-C-002: code-fixer initial — no findings in state → findingsPath fallback
 * TC-FF-C-003: code-fixer continuation — findings in state → findings embedded in continuation
 * TC-FF-C-004: code-fixer continuation — no findings in state → findingsPath in continuation
 */
import { describe, it, expect } from "vitest";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import { getLatestJudgeFindings, buildFindingsBlock } from "../../../src/core/step/fixer-helpers.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { Finding } from "../../../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalDeps(overrides: Partial<StepDeps> = {}): StepDeps {
  return {
    config: { version: 1, agents: {} },
    slug: "test-slug",
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    ...overrides,
  } as StepDeps;
}

function makeBaseJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-fixer",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStepRun(opts: {
  sessionId?: string | null;
  findings?: Finding[] | null;
  verdict?: string | null;
} = {}): StepRun {
  return {
    attempt: 1,
    sessionId: opts.sessionId ?? null,
    outcome: {
      verdict: opts.verdict ?? "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: opts.findings !== undefined
        ? { ok: true, findings: opts.findings ?? undefined }
        : undefined,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  };
}

const sampleFindings: Finding[] = [
  {
    severity: "high",
    resolution: "fixable",
    file: "src/core/foo.ts",
    line: 42,
    title: "Missing null check",
    rationale: "Null dereference possible when input is undefined",
  },
  {
    severity: "medium",
    resolution: "decision-needed",
    file: "src/core/bar.ts",
    title: "Architecture decision required",
    rationale: "Two valid approaches exist; pick one",
  },
];

// ---------------------------------------------------------------------------
// SpecFixerStep
// ---------------------------------------------------------------------------

describe("SpecFixerStep.buildMessage — findings injection", () => {
  it("TC-FF-S-001: initial run with findings → embeds findings, no findingsPath in prompt", () => {
    const state = makeBaseJobState({
      steps: {
        "spec-review": [makeStepRun({ findings: sampleFindings })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = SpecFixerStep.buildMessage!(state, deps);

    // Findings content must be embedded
    expect(msg).toContain("Missing null check");
    expect(msg).toContain("Null dereference possible");
    expect(msg).toContain("Architecture decision required");
    // HIGH severity label
    expect(msg).toContain("[HIGH]");
    // File reference
    expect(msg).toContain("src/core/foo.ts");
    // findingsPath (spec-review-result-001.md) should NOT appear — findings are embedded
    expect(msg).not.toContain("spec-review-result-001.md");
  });

  it("TC-FF-S-002: initial run without findings → findingsPath fallback", () => {
    const state = makeBaseJobState({
      steps: {
        "spec-review": [makeStepRun({ findings: null })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = SpecFixerStep.buildMessage!(state, deps);

    // findingsPath must appear
    expect(msg).toContain("spec-review-result-001.md");
    // Findings content must not be embedded
    expect(msg).not.toContain("Missing null check");
  });

  it("TC-FF-S-002b: initial run with no spec-review runs → findingsPath fallback", () => {
    const state = makeBaseJobState({ steps: {} });
    const deps = makeMinimalDeps();

    const msg = SpecFixerStep.buildMessage!(state, deps);

    // latestIteration(state, "spec-review") === 0 when no runs → spec-review-result-000.md
    expect(msg).toContain("spec-review-result-000.md");
  });

  it("TC-FF-S-003: continuation with findings → findings embedded in continuation prompt", () => {
    const state = makeBaseJobState({
      steps: {
        "spec-review": [makeStepRun({ findings: sampleFindings })],
        // A previous spec-fixer run with non-null sessionId → continuation
        "spec-fixer": [makeStepRun({ sessionId: "sess-abc123" })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = SpecFixerStep.buildMessage!(state, deps);

    // Should be continuation format with findings embedded
    expect(msg).toContain("Missing null check");
    // Should NOT reference findingsPath
    expect(msg).not.toContain("spec-review-result-001.md");
    // Continuation wording
    expect(msg).toContain("新しい findings");
  });

  it("TC-FF-S-004: continuation without findings → findingsPath in continuation prompt", () => {
    const state = makeBaseJobState({
      steps: {
        "spec-review": [makeStepRun({ findings: null })],
        "spec-fixer": [makeStepRun({ sessionId: "sess-abc123" })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = SpecFixerStep.buildMessage!(state, deps);

    // findingsPath must appear in continuation
    expect(msg).toContain("spec-review-result-001.md");
    expect(msg).toContain("新しい findings");
    // findings content must not be embedded
    expect(msg).not.toContain("Missing null check");
  });
});

// ---------------------------------------------------------------------------
// CodeFixerStep
// ---------------------------------------------------------------------------

describe("CodeFixerStep.buildMessage — findings injection", () => {
  it("TC-FF-C-001: initial run with findings → embeds findings, no findingsPath in prompt", () => {
    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [makeStepRun({ findings: sampleFindings })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // Findings content embedded
    expect(msg).toContain("Missing null check");
    expect(msg).toContain("Null dereference possible");
    expect(msg).toContain("[HIGH]");
    expect(msg).toContain("src/core/foo.ts");
    // review-feedback-001.md should NOT appear
    expect(msg).not.toContain("review-feedback-001.md");
  });

  it("TC-FF-C-002: initial run without findings → findingsPath fallback", () => {
    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [makeStepRun({ findings: null })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // findingsPath must appear
    expect(msg).toContain("review-feedback-001.md");
    // No findings embedded
    expect(msg).not.toContain("Missing null check");
  });

  it("TC-FF-C-002b: initial run with no code-review runs → findingsPath fallback", () => {
    const state = makeBaseJobState({ step: "code-fixer", steps: {} });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // latestIteration(state, "code-review") === 0 when no runs → review-feedback-000.md
    expect(msg).toContain("review-feedback-000.md");
  });

  it("TC-FF-C-003: continuation with findings → findings embedded in continuation prompt", () => {
    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [makeStepRun({ findings: sampleFindings })],
        "code-fixer": [makeStepRun({ sessionId: "sess-xyz789" })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    expect(msg).toContain("Missing null check");
    expect(msg).not.toContain("review-feedback-001.md");
    expect(msg).toContain("新しい findings");
  });

  it("TC-FF-C-004: continuation without findings → findingsPath in continuation prompt", () => {
    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [makeStepRun({ findings: null })],
        "code-fixer": [makeStepRun({ sessionId: "sess-xyz789" })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    expect(msg).toContain("review-feedback-001.md");
    expect(msg).toContain("新しい findings");
    expect(msg).not.toContain("Missing null check");
  });

  it("TC-FF-C-005: initial run with low/medium fixable findings → embedded in prompt, no findingsPath", () => {
    // Verifies D4: approved + fixable findings route to code-fixer, and those
    // findings are embedded in the prompt (not read from review-feedback file).
    const lowMediumFixableFindings: Finding[] = [
      {
        severity: "medium",
        resolution: "fixable",
        file: "src/core/pipeline/types.ts",
        line: 45,
        title: "Unused import",
        rationale: "Import is declared but never referenced in this file",
      },
      {
        severity: "low",
        resolution: "fixable",
        file: "src/core/step/executor.ts",
        title: "Missing trailing newline",
        rationale: "File should end with a newline character per style guide",
      },
    ];

    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        // code-fixer 初回 = 前回 run なし
        "code-review": [makeStepRun({ findings: lowMediumFixableFindings, verdict: "approved" })],
      },
    });
    const deps = makeMinimalDeps();

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // title must be embedded
    expect(msg).toContain("Unused import");
    expect(msg).toContain("Missing trailing newline");
    // file must be embedded
    expect(msg).toContain("src/core/pipeline/types.ts");
    expect(msg).toContain("src/core/step/executor.ts");
    // rationale must be embedded
    expect(msg).toContain("Import is declared but never referenced");
    expect(msg).toContain("File should end with a newline");
    // Severity labels
    expect(msg).toContain("[MEDIUM]");
    expect(msg).toContain("[LOW]");
    // review-feedback file path should NOT appear — findings are directly embedded
    expect(msg).not.toContain("review-feedback-001.md");
  });
});

// ---------------------------------------------------------------------------
// T-06 invariant: observations are excluded from fixer input (AC 2)
// ---------------------------------------------------------------------------

describe("fixer invariant — observations not included in fixer input (T-06)", () => {
  const findingWithObs: Finding = {
    severity: "high",
    resolution: "fixable",
    file: "src/core/foo.ts",
    line: 10,
    title: "Real fixable issue",
    rationale: "Must be fixed",
  };

  function makeStateWithObservations(): JobState {
    return makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [
          makeStepRun({
            findings: [findingWithObs],
            verdict: "approved",
          }),
        ],
      },
    });
  }

  it("getLatestJudgeFindings returns only findings (not observations)", () => {
    // Add observations to the toolResult directly to simulate a mixed toolResult
    const state = makeBaseJobState({
      step: "code-fixer",
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [findingWithObs],
                observations: [
                  {
                    severity: "low",
                    file: "src/note.ts",
                    title: "Observation only — not actionable",
                    rationale: "Informational",
                  },
                ],
              },
            },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const findings = getLatestJudgeFindings(state, "code-review");
    expect(findings).not.toBeNull();
    expect(findings).toHaveLength(1);
    expect(findings![0]!.title).toBe("Real fixable issue");
  });

  it("buildFindingsBlock output does not contain observation title", () => {
    // buildFindingsBlock only receives findings (already filtered by getLatestJudgeFindings)
    const output = buildFindingsBlock([findingWithObs]);
    expect(output).toContain("Real fixable issue");
    expect(output).not.toContain("Observation only — not actionable");
  });

  it("code-fixer buildMessage does not embed observation title in prompt", () => {
    const state = makeStateWithObservations();
    const deps = makeMinimalDeps();
    const msg = CodeFixerStep.buildMessage!(state, deps);

    // findings content must appear
    expect(msg).toContain("Real fixable issue");
    // observation title must NOT appear
    expect(msg).not.toContain("Observation only — not actionable");
  });
});
