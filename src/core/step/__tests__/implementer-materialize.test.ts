/**
 * TC-005: implementer prompt が全 must TC の実体化責務を明示する
 * TC-006: implementer message は test-materialize 実行歴に依存しない
 *
 * Source: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う
 *         > Scenario: implementer prompt が全 must TC の実体化責務を明示する
 *         > Scenario: implementer message は test-materialize 実行歴に依存しない
 */
import { describe, it, expect } from "vitest";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../prompts/implementer-system.js";
import { ImplementerStep, buildImplementerInitialMessage } from "../implementer.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "implementer-test-job",
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
    steps: {},
    ...overrides,
  } as unknown as JobState;
}

function makeStepRun(commitOid: string): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict: "success", findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    commitOid,
  } as StepRun;
}

function makeDeps(slug = "example"): StepDeps {
  return {
    slug,
    request: {
      type: "bug-fix",
      title: "Example",
      slug,
      baseBranch: "main",
      content: "Implement the feature.",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
    config: {} as never,
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: {} as never,
    storeFactory: {} as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
  } as unknown as StepDeps;
}

// ---------------------------------------------------------------------------
// TC-005: implementer prompt が全 must TC の実体化責務を明示する
// Source: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う
//         > Scenario: implementer prompt が全 must TC の実体化責務を明示する
// ---------------------------------------------------------------------------

describe("TC-005: IMPLEMENTER_SYSTEM_PROMPT contains TC materialization responsibility", () => {
  it("TC-005: prompt contains test-cases.md must TC materialization duty", () => {
    // After refactoring, the prompt must describe the single-mode responsibility:
    // "test-cases.md の（全）must TC をテストコードに実体化"
    const prompt = IMPLEMENTER_SYSTEM_PROMPT;
    // The prompt must mention test-cases.md and must TC materialization
    expect(prompt).toContain("test-cases.md");
    expect(
      prompt.includes("must TC") || prompt.includes("must") && prompt.includes("実体化"),
    ).toBe(true);
  });

  it("TC-005: prompt does NOT contain implement-only mode branch for test-materialize", () => {
    // After refactoring, the implement-only mode split ("test-materialize 済み の場合") must be gone.
    // The prompt must have a single unified mode, not a conditional branch.
    const prompt = IMPLEMENTER_SYSTEM_PROMPT;
    expect(prompt).not.toContain("test-materialize 済み");
    expect(prompt).not.toContain("test-materialize 済");
  });

  it("TC-005: prompt does NOT describe implement-only mode as a conditional path", () => {
    // The two-branch structure "test-materialize 済み の場合: ... / 未 materialize の場合: ..."
    // must be replaced by a single unified responsibility description.
    const prompt = IMPLEMENTER_SYSTEM_PROMPT;
    // The old branch: "Standard pipeline post-test-materialize: canon-alignment mode"
    expect(prompt).not.toContain("Standard pipeline post-test-materialize");
    // The old branch: "implement-only mode"
    expect(prompt).not.toContain("implement-only mode");
  });
});

// ---------------------------------------------------------------------------
// TC-006: implementer message は test-materialize 実行歴に依存しない
// Source: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う
//         > Scenario: implementer message は test-materialize 実行歴に依存しない
// ---------------------------------------------------------------------------

describe("TC-006: ImplementerStep.buildMessage does not branch on test-materialize history", () => {
  const slug = "example";
  const branch = "change/example-abc12345";
  const deps = makeDeps(slug);

  it("TC-006: buildMessage produces identical output with or without test-materialize history", () => {
    // State with test-materialize run history
    const stateWithMaterialize = makeState({
      branch,
      steps: {
        "test-materialize": [makeStepRun("mat-sha-001")],
      },
    });

    // State with no test-materialize history
    const stateWithoutMaterialize = makeState({
      branch,
      steps: {},
    });

    const msgWith = ImplementerStep.buildMessage(stateWithMaterialize, deps);
    const msgWithout = ImplementerStep.buildMessage(stateWithoutMaterialize, deps);

    // Messages must be identical: no branching on test-materialize history
    expect(msgWith).toBe(msgWithout);
  });

  it("TC-006: buildImplementerInitialMessage does not accept testsMaterialized branching parameter", () => {
    // After refactoring, buildImplementerInitialMessage should produce the same message
    // regardless of whether testsMaterialized was true or false in the old API.
    // (The parameter is removed; the function has a single mode.)
    const baseMsg = buildImplementerInitialMessage({
      slug,
      branch,
      requestContent: "Implement the feature.",
    });

    // The message must contain the unified responsibility description
    expect(baseMsg).toContain(slug);
    expect(baseMsg).toContain(branch);

    // Must NOT contain any implement-only mode text that was present in the old branched version
    expect(baseMsg).not.toContain("The test-materialize step has already written test code");
    expect(baseMsg).not.toContain("implement-only");
  });

  it("TC-006: buildMessage does not reference state.steps['test-materialize']", () => {
    // Verify by checking state with test-materialize runs vs multiple additional runs —
    // if the message were branched, different histories would produce different messages.
    const stateA = makeState({
      branch,
      steps: {
        "test-materialize": [
          makeStepRun("mat-sha-001"),
          makeStepRun("mat-sha-002"),
        ],
      },
    });
    const stateB = makeState({ branch, steps: {} });

    // Both should produce the same message (single-mode implementer)
    expect(ImplementerStep.buildMessage(stateA, deps)).toBe(
      ImplementerStep.buildMessage(stateB, deps),
    );
  });
});
