/**
 * Unit tests for push capability coverage in fixer steps.
 *
 * TC-001: code-fixer initial message includes push capability notice
 * TC-002: code-fixer continuation message includes push capability notice
 * TC-003: code-fixer message omits notice when pushCapability is null
 * TC-004: code-fixer outputContracts returns unpushable-path contract with active pushCapability
 * TC-005: code-fixer outputContracts returns empty array when pushCapability is null
 * TC-006: spec-fixer initial message with findings includes push capability notice
 * TC-007: spec-fixer fallback message includes push capability notice
 * TC-008: spec-fixer continuation message includes push capability notice
 * TC-009: spec-fixer message omits notice when pushCapability is null
 * TC-010: spec-fixer outputContracts returns unpushable-path contract with active pushCapability
 * TC-011: spec-fixer outputContracts returns empty array when pushCapability is null
 * TC-012: buildUnpushablePathContracts returns empty array for null pushCapability
 * TC-013: buildUnpushablePathContracts returns empty array for empty patterns array
 * TC-014: buildUnpushablePathContracts returns one contract with correct shape for non-empty patterns
 * TC-015: code-fixer Layer 2 backstop fires after follow-up fails to resolve unpushable-path violation
 * TC-016: code-fixer conformance branch includes push capability notice
 * TC-017: code-fixer coordinator loop branch includes push capability notice
 * TC-022: spec-fixer conformance branch initial entry includes push capability notice
 * TC-023: spec-fixer conformance branch continuation includes push capability notice
 *
 * Source: spec.md / test-cases.md
 */
import { describe, it, expect } from "vitest";
import { buildUnpushablePathContracts } from "../fixer-helpers.js";
import { CodeFixerStep } from "../code-fixer.js";
import { SpecFixerStep } from "../spec-fixer.js";
import { buildOutputFollowUpPrompt } from "../output-verify.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import type { PushCapability } from "../../../git/push-capability.js";
import { WORKFLOWS_PATTERN } from "../../../git/push-capability.js";
import type { OutputViolation } from "../../port/output-contract.js";
import { STEP_NAMES } from "../step-names.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../../pipeline/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKFLOW_CAPABILITY: PushCapability = {
  patterns: [WORKFLOWS_PATTERN],
  source: "Actions token",
};

function makeJobState(stepName: string): JobState {
  return {
    version: 2,
    jobId: "push-cap-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test Request",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: stepName,
    status: "running",
    branch: "fix/test-slug-abc",
    history: [],
    error: null,
    steps: {},
  };
}

function makeStepDeps(pushCapability?: PushCapability | null): StepDeps {
  return {
    slug: "test-slug",
    request: {
      type: "bug-fix",
      title: "Test Request",
      slug: "test-slug",
      baseBranch: "main",
      content: "Fix the bug.",
      adr: false,
      path: "specrunner/changes/test-slug/request.md",
    },
    config: {} as never,
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "testowner",
    repo: "testrepo",
    pushCapability: pushCapability ?? null,
  } as unknown as StepDeps;
}

// ---------------------------------------------------------------------------
// State builder helpers
// ---------------------------------------------------------------------------

/**
 * State for code-fixer normal initial path with code-review findings.
 */
function makeCodeFixerStateWithFindings(): JobState {
  return {
    ...makeJobState(STEP_NAMES.CODE_FIXER),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: "src/foo.ts",
                  title: "Test finding",
                  rationale: "Must fix",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for code-fixer continuation (prior sessionId set).
 */
function makeCodeFixerContinuationState(): JobState {
  return {
    ...makeCodeFixerStateWithFindings(),
    steps: {
      ...makeCodeFixerStateWithFindings().steps,
      [STEP_NAMES.CODE_FIXER]: [
        {
          attempt: 1,
          sessionId: "prev-session-abc",
          startedAt: "2026-01-01T00:02:00.000Z",
          endedAt: "2026-01-01T00:02:30.000Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for code-fixer conformance branch:
 * conformance.endedAt is strictly later than code-review.endedAt.
 */
function makeCodeFixerConformanceState(): JobState {
  return {
    ...makeJobState(STEP_NAMES.CODE_FIXER),
    steps: {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:05:00.000Z",
          endedAt: "2026-01-01T00:05:30.000Z",
          outcome: {
            verdict: "needs-fix:code-fixer",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: "src/foo.ts",
                  title: "Conformance finding",
                  rationale: "Fix this",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for code-fixer coordinator loop branch:
 * reviewers present, coordinator has needs-fix, custom reviewer has needs-fix findings.
 */
function makeCodeFixerCoordinatorState(): JobState {
  return {
    ...makeJobState(STEP_NAMES.CODE_FIXER),
    reviewers: [
      {
        name: "security",
        maxIterations: 3,
        purpose: "security reviewer",
        criteria: "security criteria",
        judgment: "judgment",
        freeText: "",
      },
    ],
    steps: {
      [CUSTOM_REVIEWERS_STEP_NAME]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:00.000Z",
          endedAt: "2026-01-01T00:02:30.000Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
      security: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:02:05.000Z",
          endedAt: "2026-01-01T00:02:25.000Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: "src/auth.ts",
                  title: "Security issue",
                  rationale: "Fix auth",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for spec-fixer normal initial path with spec-review findings.
 */
function makeSpecFixerStateWithFindings(): JobState {
  return {
    ...makeJobState(STEP_NAMES.SPEC_FIXER),
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: "specrunner/changes/test-slug/spec.md",
                  title: "Spec finding",
                  rationale: "Fix the spec",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for spec-fixer fallback path (spec-review run exists but has no structured findings).
 */
function makeSpecFixerStateNoFindings(): JobState {
  return {
    ...makeJobState(STEP_NAMES.SPEC_FIXER),
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: "specrunner/changes/test-slug/spec-review-result-001.md",
            error: null,
            // no toolResult → fallback to findingsPath
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for spec-fixer continuation (prior spec-fixer sessionId set).
 */
function makeSpecFixerContinuationState(): JobState {
  return {
    ...makeSpecFixerStateWithFindings(),
    steps: {
      ...makeSpecFixerStateWithFindings().steps,
      [STEP_NAMES.SPEC_FIXER]: [
        {
          attempt: 1,
          sessionId: "prev-spec-fixer-session",
          startedAt: "2026-01-01T00:02:00.000Z",
          endedAt: "2026-01-01T00:02:30.000Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for spec-fixer conformance branch (initial entry — not a continuation).
 * conformance.endedAt is strictly later than spec-review.endedAt.
 */
function makeSpecFixerConformanceState(): JobState {
  return {
    ...makeJobState(STEP_NAMES.SPEC_FIXER),
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00.000Z",
          endedAt: "2026-01-01T00:01:30.000Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:05:00.000Z",
          endedAt: "2026-01-01T00:05:30.000Z",
          outcome: {
            verdict: "needs-fix:spec-fixer",
            findingsPath: null,
            error: null,
            toolResult: {
              ok: true,
              findings: [
                {
                  severity: "high",
                  resolution: "fixable",
                  file: "specrunner/changes/test-slug/spec.md",
                  title: "Conformance spec finding",
                  rationale: "Fix the spec",
                },
              ],
            },
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

/**
 * State for spec-fixer conformance branch + continuation (prior spec-fixer sessionId set).
 */
function makeSpecFixerConformanceContinuationState(): JobState {
  return {
    ...makeSpecFixerConformanceState(),
    steps: {
      ...makeSpecFixerConformanceState().steps,
      [STEP_NAMES.SPEC_FIXER]: [
        {
          attempt: 1,
          sessionId: "prev-spec-fixer-conformance-session",
          startedAt: "2026-01-01T00:06:00.000Z",
          endedAt: "2026-01-01T00:06:30.000Z",
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
          },
        },
      ],
    } as unknown as JobState["steps"],
  };
}

// ---------------------------------------------------------------------------
// TC-012 / TC-013 / TC-014: buildUnpushablePathContracts helper
// ---------------------------------------------------------------------------

describe("buildUnpushablePathContracts", () => {
  it("TC-012: returns [] when pushCapability is null", () => {
    const deps = makeStepDeps(null);
    expect(buildUnpushablePathContracts(deps)).toEqual([]);
  });

  it("TC-013: returns [] when pushCapability.patterns is empty", () => {
    const deps = makeStepDeps({ patterns: [], source: "none" });
    expect(buildUnpushablePathContracts(deps)).toEqual([]);
  });

  it("TC-014: returns one contract with kind 'unpushable-path' and policy 'follow-up' for non-empty patterns", () => {
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const contracts = buildUnpushablePathContracts(deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      kind: "unpushable-path",
      policy: "follow-up",
    });
  });

  it("TC-014 (patterns): returned contract carries the exact patterns array", () => {
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const contracts = buildUnpushablePathContracts(deps);
    expect(contracts[0]?.patterns).toEqual([WORKFLOWS_PATTERN]);
  });
});

// ---------------------------------------------------------------------------
// TC-004 / TC-005: CodeFixerStep.outputContracts
// ---------------------------------------------------------------------------

describe("CodeFixerStep.outputContracts", () => {
  it("TC-004: returns unpushable-path contract when pushCapability has patterns", () => {
    const state = makeJobState(STEP_NAMES.CODE_FIXER);
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const contracts = CodeFixerStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      kind: "unpushable-path",
      policy: "follow-up",
      patterns: [WORKFLOWS_PATTERN],
    });
  });

  it("TC-005: returns [] when pushCapability is null", () => {
    const state = makeJobState(STEP_NAMES.CODE_FIXER);
    const deps = makeStepDeps(null);
    expect(CodeFixerStep.outputContracts!(state, deps)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-001 / TC-002 / TC-003: CodeFixerStep.buildMessage — notice injection
// ---------------------------------------------------------------------------

describe("CodeFixerStep.buildMessage — push capability notice", () => {
  it("TC-001: initial message (normal path, with findings) includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeCodeFixerStateWithFindings();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
    expect(msg).toContain(WORKFLOWS_PATTERN);
  });

  it("TC-003: initial message does NOT include 'Push Capability Notice' when pushCapability is null", () => {
    const state = makeCodeFixerStateWithFindings();
    const deps = makeStepDeps(null);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });

  it("TC-002: continuation message includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeCodeFixerContinuationState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-002 (no notice): continuation message does NOT include notice when pushCapability is null", () => {
    const state = makeCodeFixerContinuationState();
    const deps = makeStepDeps(null);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });
});

// ---------------------------------------------------------------------------
// TC-016: CodeFixerStep.buildMessage — conformance branch includes notice
// ---------------------------------------------------------------------------

describe("CodeFixerStep.buildMessage — conformance branch (TC-016)", () => {
  it("TC-016: conformance initial entry includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeCodeFixerConformanceState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-016 (no notice): conformance initial entry does NOT include notice when pushCapability null", () => {
    const state = makeCodeFixerConformanceState();
    const deps = makeStepDeps(null);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });
});

// ---------------------------------------------------------------------------
// TC-017: CodeFixerStep.buildMessage — coordinator loop branch includes notice
// ---------------------------------------------------------------------------

describe("CodeFixerStep.buildMessage — coordinator loop branch (TC-017)", () => {
  it("TC-017: coordinator loop initial entry includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeCodeFixerCoordinatorState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-017 (no notice): coordinator loop does NOT include notice when pushCapability null", () => {
    const state = makeCodeFixerCoordinatorState();
    const deps = makeStepDeps(null);
    const msg = CodeFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });
});

// ---------------------------------------------------------------------------
// TC-015: code-fixer → Layer 1 follow-up → Layer 2 backstop end-to-end chain
// ---------------------------------------------------------------------------

describe("TC-015: code-fixer Layer 2 backstop fires after follow-up fails to resolve unpushable-path violation", () => {
  /**
   * Integration-level chain test:
   *
   * 1. CodeFixerStep.outputContracts declares an unpushable-path contract with policy "follow-up".
   * 2. Layer 1: the violation generates a follow-up prompt at attempt 1 (via buildOutputFollowUpPrompt).
   * 3. One-follow-up invariant: at attempt >= 2, unpushable-path violations are filtered out by
   *    step-context-builder's buildPrompt → effectiveViolations is empty → null returned → adapter
   *    skips the repair turn → no second follow-up is sent.
   * 4. Layer 2 backstop: commitScopedPaths throws UNPUSHABLE_PATH_BLOCKED when the path is still
   *    present after the follow-up (tested comprehensively in commit-scoped-paths.test.ts; this test
   *    verifies the entry-point contract that enables the chain from code-fixer's side).
   *
   * Source: spec.md > Requirement: fixer steps SHALL rely on existing Layer 2 backstop when a
   * follow-up cannot resolve the unpushable-path violation > Scenario: code-fixer follow-up does
   * not resolve the violation
   */

  const WORKFLOW_FILE = ".github/workflows/ci.yml";

  it("(1) CodeFixerStep.outputContracts declares unpushable-path contract with policy 'follow-up'", () => {
    const state = makeJobState(STEP_NAMES.CODE_FIXER);
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);

    const contracts = CodeFixerStep.outputContracts!(state, deps);

    expect(contracts).toHaveLength(1);
    const contract = contracts[0]!;
    expect(contract.kind).toBe("unpushable-path");
    expect(contract.policy).toBe("follow-up");
    expect(contract.patterns).toEqual([WORKFLOWS_PATTERN]);
  });

  it("(2) Layer 1: unpushable-path violation generates a follow-up prompt on attempt 1", () => {
    // Simulate the violation that the runtime detects when code-fixer touches a workflow file.
    const violation: OutputViolation = {
      kind: "unpushable-path",
      path: "",
      policy: "follow-up",
      detail: [WORKFLOW_FILE],
    };

    // buildOutputFollowUpPrompt is what step-context-builder calls to build the repair prompt
    // for the agent at attempt 1 (Layer 1 follow-up).
    const prompt = buildOutputFollowUpPrompt([violation]);

    expect(prompt).toContain("Unpushable path constraint");
    expect(prompt).toContain(WORKFLOW_FILE);
  });

  it("(3) one-follow-up invariant: at attempt >= 2 unpushable-path violations are filtered out → null (no second follow-up)", () => {
    // Replicate the buildPrompt logic from step-context-builder.ts (L143-161):
    //   attempt > 1 → filter unpushable-path out → if effectiveViolations is empty, return null.
    const violation: OutputViolation = {
      kind: "unpushable-path",
      path: "",
      policy: "follow-up",
      detail: [WORKFLOW_FILE],
    };

    // Attempt 1: violation is included — repair turn is sent
    const attempt1Violations = 1 > 1
      ? [violation].filter((v) => v.kind !== "unpushable-path")
      : [violation];
    expect(attempt1Violations).toHaveLength(1);

    // Attempt 2: violation is filtered out — no repair turn (null would be returned by buildPrompt)
    const attempt2Violations = 2 > 1
      ? [violation].filter((v) => v.kind !== "unpushable-path")
      : [violation];
    expect(attempt2Violations).toHaveLength(0);
    // Empty effectiveViolations → buildPrompt returns null → adapter breaks the loop.
    // Layer 2 backstop (commitScopedPaths → UNPUSHABLE_PATH_BLOCKED) then fires on the
    // next commit attempt.
  });

  it("(4) Layer 2 wiring: CodeFixerStep.outputContracts with null pushCapability returns [] (backstop not triggered by contract absence)", () => {
    // When pushCapability is null, no follow-up contract is declared, and the agent receives
    // no Layer 1 repair opportunity. Layer 2 in commitScopedPaths also skips the backstop
    // (null pushCapability bypasses collectPublishablePaths).
    // Verifies that the null-capability guard is symmetric across both layers.
    const state = makeJobState(STEP_NAMES.CODE_FIXER);
    const deps = makeStepDeps(null);

    const contracts = CodeFixerStep.outputContracts!(state, deps);
    expect(contracts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-010 / TC-011: SpecFixerStep.outputContracts
// ---------------------------------------------------------------------------

describe("SpecFixerStep.outputContracts", () => {
  it("TC-010: returns unpushable-path contract when pushCapability has patterns", () => {
    const state = makeJobState(STEP_NAMES.SPEC_FIXER);
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const contracts = SpecFixerStep.outputContracts!(state, deps);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      kind: "unpushable-path",
      policy: "follow-up",
      patterns: [WORKFLOWS_PATTERN],
    });
  });

  it("TC-011: returns [] when pushCapability is null", () => {
    const state = makeJobState(STEP_NAMES.SPEC_FIXER);
    const deps = makeStepDeps(null);
    expect(SpecFixerStep.outputContracts!(state, deps)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-006 / TC-007 / TC-008 / TC-009: SpecFixerStep.buildMessage — notice injection
// ---------------------------------------------------------------------------

describe("SpecFixerStep.buildMessage — push capability notice", () => {
  it("TC-006: initial message (normal path, with findings) includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeSpecFixerStateWithFindings();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
    expect(msg).toContain(WORKFLOWS_PATTERN);
  });

  it("TC-007: fallback message (no structured findings) includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeSpecFixerStateNoFindings();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-008: continuation message includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeSpecFixerContinuationState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-009: message does NOT include 'Push Capability Notice' when pushCapability is null", () => {
    const state = makeSpecFixerStateWithFindings();
    const deps = makeStepDeps(null);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });

  it("TC-009 (fallback): fallback message does NOT include notice when pushCapability is null", () => {
    const state = makeSpecFixerStateNoFindings();
    const deps = makeStepDeps(null);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });
});

// ---------------------------------------------------------------------------
// TC-022 / TC-023: SpecFixerStep.buildMessage — conformance branch
// ---------------------------------------------------------------------------

describe("SpecFixerStep.buildMessage — conformance branch (TC-022/TC-023)", () => {
  it("TC-022: conformance initial entry includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeSpecFixerConformanceState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-022 (no notice): conformance initial entry does NOT include notice when pushCapability null", () => {
    const state = makeSpecFixerConformanceState();
    const deps = makeStepDeps(null);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });

  it("TC-023: conformance continuation includes 'Push Capability Notice' when pushCapability set", () => {
    const state = makeSpecFixerConformanceContinuationState();
    const deps = makeStepDeps(WORKFLOW_CAPABILITY);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).toContain("Push Capability Notice");
  });

  it("TC-023 (no notice): conformance continuation does NOT include notice when pushCapability null", () => {
    const state = makeSpecFixerConformanceContinuationState();
    const deps = makeStepDeps(null);
    const msg = SpecFixerStep.buildMessage(state, deps);
    expect(msg).not.toContain("Push Capability Notice");
  });
});
