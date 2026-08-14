/**
 * Tests for severity-fixability-split
 *
 * Pins the new behavior where LOW severity fixable findings are treated as
 * first-class fix targets, equal to MEDIUM/HIGH/CRITICAL.
 *
 * Source: specrunner/changes/severity-fixability-split/test-cases.md
 * TC IDs are frozen — do not renumber.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// ---------------------------------------------------------------------------
// Routing / verdict functions
// ---------------------------------------------------------------------------
import {
  selectFixerTargetFindings,
  deriveJudgeVerdict,
  deriveRegressionGateVerdict,
} from "../../../src/core/step/judge-verdict.js";
import type { Finding } from "../../../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Code-fixer step + prompts
// ---------------------------------------------------------------------------
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/code-fixer-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/spec-fixer-system.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// ---------------------------------------------------------------------------
// Pipeline / transitions
// ---------------------------------------------------------------------------
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";

// ---------------------------------------------------------------------------
// Executor / no-op integration
// ---------------------------------------------------------------------------
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn as GitSpawnFn } from "../../../src/util/git-exec.js";

// ===========================================================================
// Shared helpers
// ===========================================================================

function makeFinding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
  overrides: Partial<Finding> = {},
): Finding {
  return {
    severity,
    resolution,
    file: "src/foo.ts",
    title: `${severity.toUpperCase()} issue`,
    rationale: "test rationale",
    ...overrides,
  };
}

function makeMinimalDeps(slug = "test-slug"): StepDeps {
  return {
    config: { version: 1, agents: {} },
    slug,
    request: {
      type: "feature",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "Fix the code.",
      adr: false,
    },
  } as unknown as StepDeps;
}

function makeBaseState(steps: Record<string, unknown[]> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-fixer",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: steps as unknown as JobState["steps"],
  };
}

/** A code-review step run with the given verdict and findings. */
function makeCodeReviewRun(verdict: string, findings: Finding[]) {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:01:00Z",
    endedAt: "2026-01-01T00:01:30Z",
    outcome: {
      verdict,
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

/** State: code-review ran with the given verdict and findings. */
function makeStateWithCodeReview(verdict: string, findings: Finding[]): JobState {
  return makeBaseState({
    [STEP_NAMES.CODE_REVIEW]: [makeCodeReviewRun(verdict, findings)],
  });
}

// ---------------------------------------------------------------------------
// Executor integration helpers (mirrors src/core/step/__tests__/executor-no-op.test.ts)
// ---------------------------------------------------------------------------

function makeStore() {
  return {
    update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
    appendHistory: async (state: JobState) => state,
    fail: async (state: JobState) => state,
    persist: async () => undefined,
    appendLineage: async () => undefined,
  };
}

function makeRuntimeStrategy(changedFiles: string[]) {
  return {
    captureHeadSha: vi.fn(async () => "abc123head" as string | null),
    prepareStepArtifacts: vi.fn(async () => {}),
    finalizeStepArtifacts: vi.fn(async () => {}),
    validateStepInputs: vi.fn(async () => {}),
    validateStepOutputs: vi.fn(async () => [] as never[]),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: changedFiles })),
  };
}

function makeRunner() {
  return {
    run: vi.fn(async () => ({
      completionReason: "success" as const,
      resultContent: null,
      sessionId: null,
      agentBranch: null,
      modelUsage: undefined,
      toolResult: null,
      followUpAttempts: 0,
      transientRetryAttempts: 0,
      completionReportDiagnostics: [],
    })),
  };
}

function makeNoOpStep(): AgentStep {
  return {
    kind: "agent",
    name: "code-fixer",
    agent: { id: "code-fixer-agent" } as never,
    completionVerdict: "approved" as const,
    noOpDetect: true,
    buildMessage: () => "fix the code",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

function makeDeps(runtimeStrategy: ReturnType<typeof makeRuntimeStrategy>): PipelineDeps {
  const store = makeStore();
  return {
    cwd: "/tmp/worktree",
    slug: "example",
    config: {} as never,
    request: {
      type: "bug-fix",
      title: "Example",
      slug: "example",
      baseBranch: "main",
      content: "Example request",
      adr: false,
      path: "specrunner/changes/example/request.md",
    },
    dynamicContext: undefined,
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: vi.fn() as never,
    storeFactory: () => store as never,
    runner: {} as never,
    resumePrompt: undefined,
    resumeContext: undefined,
    runtimeStrategy: runtimeStrategy as never,
  } as PipelineDeps;
}

function makeGitRevParseSpawnFn(headSha: string): GitSpawnFn {
  return (_bin: string, args: string[], _opts): ChildProcess => {
    const child = new EventEmitter();
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    Object.assign(child, { stdout: stdoutEE, stderr: stderrEE, stdin: { end: () => {} } });
    setImmediate(() => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        stdoutEE.emit("data", Buffer.from(`${headSha}\n`));
        child.emit("close", 0);
      } else {
        child.emit("close", 128);
      }
    });
    return child as unknown as ChildProcess;
  };
}

// Suppress stderrWrite noise in executor/no-op during these tests
beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// TC-001: LOW fixable finding is included in the fixer target set
// ===========================================================================

describe("TC-001: selectFixerTargetFindings includes LOW fixable findings", () => {
  // Source: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity
  //         > Scenario: LOW fixable finding is included in the fixer target set
  it("TC-001: returns LOW, HIGH, and MEDIUM fixable findings", () => {
    const findings: Finding[] = [
      makeFinding("low", "fixable", { title: "LOW issue" }),
      makeFinding("high", "fixable", { title: "HIGH issue" }),
      makeFinding("medium", "fixable", { title: "MED issue" }),
    ];
    const result = selectFixerTargetFindings(findings);
    const titles = result.map((f) => f.title);
    // After D1: all three severities are included
    expect(titles).toContain("LOW issue");
    expect(titles).toContain("HIGH issue");
    expect(titles).toContain("MED issue");
  });
});

// ===========================================================================
// TC-002: only-LOW input still routes the LOW findings
// ===========================================================================

describe("TC-002: only-LOW input still routes LOW findings (not empty)", () => {
  // Source: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity
  //         > Scenario: only-LOW input still routes the LOW findings
  it("TC-002: low-only input returns non-empty result", () => {
    const findings: Finding[] = [
      makeFinding("low", "fixable", { title: "LOW1" }),
      makeFinding("low", "fixable", { title: "LOW2" }),
    ];
    const result = selectFixerTargetFindings(findings);
    // After D1: low findings are returned (not filtered to empty)
    expect(result.length).toBeGreaterThan(0);
    const titles = result.map((f) => f.title);
    expect(titles).toContain("LOW1");
    expect(titles).toContain("LOW2");
  });
});

// ===========================================================================
// TC-003: non-fixable findings are still excluded from fixer target set
// ===========================================================================

describe("TC-003: non-fixable findings are excluded from fixer target set", () => {
  // Source: spec.md > Requirement: Fixer routing targets all fixable findings regardless of severity
  //         > Scenario: non-fixable findings are still excluded
  it("TC-003: decision-needed finding is not in the result", () => {
    const findings: Finding[] = [
      makeFinding("low", "decision-needed", { title: "LOW decision-needed" }),
    ];
    const result = selectFixerTargetFindings(findings);
    // decision-needed is never a fixer target regardless of severity
    expect(result).toHaveLength(0);
  });

  it("TC-003: mixed: fixable low included, decision-needed excluded", () => {
    const findings: Finding[] = [
      makeFinding("low", "fixable", { title: "LOW fixable" }),
      makeFinding("high", "decision-needed", { title: "HIGH decision" }),
    ];
    const result = selectFixerTargetFindings(findings);
    const titles = result.map((f) => f.title);
    expect(titles).toContain("LOW fixable");
    expect(titles).not.toContain("HIGH decision");
  });
});

// ===========================================================================
// TC-004: LOW fixable finding appears in the code-fixer prompt
// ===========================================================================

describe("TC-004: LOW fixable finding appears in code-fixer buildMessage prompt", () => {
  // Source: spec.md > Requirement: Code-fixer instructions treat every routed finding as a mandatory fix
  //         > Scenario: LOW fixable finding appears in the code-fixer prompt
  it("TC-004: LOW finding (including [LOW] label, title, file, rationale) appears in prompt", () => {
    const lowFinding: Finding = {
      severity: "low",
      resolution: "fixable",
      file: "src/core/step/executor.ts",
      title: "Missing trailing newline",
      rationale: "File should end with a newline character per style guide",
    };
    const medFinding: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: "src/core/pipeline/types.ts",
      line: 45,
      title: "Unused import",
      rationale: "Import is declared but never referenced in this file",
    };

    const state = makeBaseState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun("approved", [medFinding, lowFinding]),
      ],
    });
    const deps = makeMinimalDeps("test-slug");

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // After D1: LOW finding is included in selectFixerTargetFindings → appears in prompt
    // LOW label
    expect(msg).toContain("[LOW]");
    // LOW finding title
    expect(msg).toContain("Missing trailing newline");
    // LOW finding file
    expect(msg).toContain("src/core/step/executor.ts");
    // LOW finding rationale
    expect(msg).toContain("File should end with a newline character per style guide");
    // MEDIUM still appears
    expect(msg).toContain("[MEDIUM]");
    expect(msg).toContain("Unused import");
  });
});

// ===========================================================================
// TC-005: message states findings are fixed regardless of severity
// ===========================================================================

describe("TC-005: buildMessage instructs fixing all findings regardless of severity", () => {
  // Source: spec.md > Requirement: Code-fixer instructions treat every routed finding as a mandatory fix
  //         > Scenario: message states findings are fixed regardless of severity
  it("TC-005: prompt contains 'regardless of severity' and not severity-tiered instruction", () => {
    const finding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/core/foo.ts",
      title: "Null check missing",
      rationale: "May crash",
    };

    const state = makeBaseState({
      [STEP_NAMES.CODE_REVIEW]: [makeCodeReviewRun("needs-fix", [finding])],
    });
    const deps = makeMinimalDeps("test-slug");

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // After D3: all branches use severity-neutral instruction
    expect(msg).toContain("regardless of severity");
    // The old tiered instruction should NOT appear
    expect(msg).not.toContain("Fix all HIGH and CRITICAL severity findings");
  });

  it("TC-005: findingsPath fallback branch also contains regardless of severity", () => {
    // Simulate a state where findings are null → findingsPath fallback
    const state = makeBaseState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            // no toolResult → findings = null → falls back to findingsPath prompt
            toolResult: undefined,
          },
        },
      ],
    });
    const deps = makeMinimalDeps("test-slug");

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // After D3: findingsPath fallback also uses severity-neutral instruction
    expect(msg).toContain("regardless of severity");
    expect(msg).not.toContain("Fix all HIGH and CRITICAL severity findings");
  });
});

// ===========================================================================
// TC-006: code-fixer system prompt does not instruct ignoring LOW findings
// ===========================================================================

describe("TC-006: CODE_FIXER_SYSTEM_PROMPT does not instruct ignoring LOW findings", () => {
  // Source: spec.md > Requirement: Fixer prompts contain no severity-based re-filter
  //         > Scenario: code-fixer system prompt does not instruct ignoring LOW findings
  it("TC-006: system prompt contains no 'LOW は無視' or 'ignore LOW' instruction", () => {
    // After D4: the "LOW は無視" line is removed from the old-format fallback
    expect(CODE_FIXER_SYSTEM_PROMPT).not.toContain("LOW は無視");
    expect(CODE_FIXER_SYSTEM_PROMPT).not.toContain("LOW は ignore");
  });

  it("TC-006: system prompt contains no severity-conditional exclusion of low", () => {
    // The prompt should not contain any text that says LOW should be ignored/skipped
    const prompt = CODE_FIXER_SYSTEM_PROMPT.toLowerCase();
    // Check for common variants of "ignore low"
    expect(prompt).not.toMatch(/low.{0,30}ignore|ignore.{0,30}low|low.{0,30}skip|low.{0,30}無視/);
  });
});

// ===========================================================================
// TC-007: high fixable finding yields needs-fix
// ===========================================================================

describe("TC-007: high fixable finding yields needs-fix (verdict semantics preserved)", () => {
  // Source: spec.md > Requirement: Critical/high fixable findings retain the fix-plus-re-review path
  //         > Scenario: high fixable finding yields needs-fix
  it("TC-007: deriveJudgeVerdict with high fixable → needs-fix", () => {
    const findings = [makeFinding("high", "fixable")];
    expect(deriveJudgeVerdict(findings, true)).toBe("needs-fix");
  });
});

// ===========================================================================
// TC-008: low/medium fixable yields approved verdict
// ===========================================================================

describe("TC-008: low/medium fixable yields approved verdict (observation auto-fix path)", () => {
  // Source: spec.md > Requirement: Low/medium fixable findings are fixed without re-review
  //         > Scenario: low/medium fixable yields approved verdict
  it("TC-008: deriveJudgeVerdict with medium+low fixable → approved", () => {
    const findings = [
      makeFinding("medium", "fixable"),
      makeFinding("low", "fixable"),
    ];
    expect(deriveJudgeVerdict(findings, true)).toBe("approved");
  });
});

// ===========================================================================
// TC-009: code-fixer that applied an approved-path fix proceeds without re-review
// ===========================================================================

describe("TC-009: code-fixer approved in approved-path context proceeds to conformance (no re-review)", () => {
  // Source: spec.md > Requirement: Low/medium fixable findings are fixed without re-review
  //         > Scenario: code-fixer that applied an approved-path fix proceeds without re-review
  it("TC-009: STANDARD_TRANSITIONS first-matching code-fixer→approved goes to conformance (not code-review)", () => {
    // State: code-review approved with fixable finding (approved-path context)
    const state = makeStateWithCodeReview("approved", [
      makeFinding("low", "fixable"),
    ]);

    // Pipeline uses first-match: find the first row that fires for code-fixer→approved
    const firstMatch = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.CODE_FIXER &&
        t.on === "approved" &&
        (!t.when || t.when(state)),
    );

    // First match must exist and must go to conformance (forward), not back to code-review
    expect(firstMatch).toBeDefined();
    expect(firstMatch?.to).toBe(STEP_NAMES.CONFORMANCE);
    expect(firstMatch?.to).not.toBe(STEP_NAMES.CODE_REVIEW);
  });
});

// ===========================================================================
// TC-010: a low-severity ledger entry that regressed yields needs-fix
// ===========================================================================

describe("TC-010: low-severity ledger entry that regressed yields needs-fix", () => {
  // Source: spec.md > Requirement: Regression-gate verifies the entire findings ledger
  //         > Scenario: a low-severity ledger entry that regressed yields needs-fix
  it("TC-010: deriveRegressionGateVerdict with low fixable → needs-fix", () => {
    // After D2: the ledger is no longer filtered to remove low entries before calling
    // this function; any fixable finding (any severity) yields needs-fix
    const findings = [makeFinding("low", "fixable")];
    expect(deriveRegressionGateVerdict(findings, true)).toBe("needs-fix");
  });

  it("TC-010: any fixable severity (low/medium/high/critical) yields needs-fix", () => {
    for (const severity of ["low", "medium", "high", "critical"] as Finding["severity"][]) {
      const findings = [makeFinding(severity, "fixable")];
      // each severity with fixable resolution must yield needs-fix
      expect(deriveRegressionGateVerdict(findings, true), `${severity} fixable`).toBe("needs-fix");
    }
  });
});

// ===========================================================================
// TC-011: approved findings-routing no-op is escalated (no suppression after D5)
// ===========================================================================

describe("TC-011: approved findings-routing no-op overrides verdict to needs-fix", () => {
  // Source: spec.md > Requirement: A code-fixer no-op on a routed target is not silently accepted
  //         > Scenario: approved findings-routing no-op is escalated
  //
  // RED before D5: executor passes findingsRoutingApproved: codeReviewFindingsRoutingActive(state)
  //   which is true → detectNoOp returns undefined → verdict stays "approved"
  // GREEN after D5: suppression removed → detectNoOp returns "needs-fix" → verdict "needs-fix"

  it("TC-011: code-review approved + fixable finding + only artifact files changed → needs-fix", async () => {
    const runner = makeRunner();
    // Only artifact files changed (no source files)
    const runtimeStrategy = makeRuntimeStrategy([
      "specrunner/changes/example/state.json",
      "specrunner/changes/example/events.jsonl",
    ]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      storeFactory,
      makeGitRevParseSpawnFn("abc123head"),
    );

    const step = makeNoOpStep();
    // State: code-review approved with a low fixable finding
    // (previously triggered suppression via codeReviewFindingsRoutingActive)
    const state: JobState = {
      ...makeBaseState({}),
      step: "code-fixer",
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          makeCodeReviewRun("approved", [
            makeFinding("low", "fixable"),
          ]),
        ],
      } as unknown as JobState["steps"],
    };
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // After D5: no suppression → no-op → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });
});

// ===========================================================================
// TC-012: a finding-named document change still counts as work
// ===========================================================================

describe("TC-012: finding-named document change counts as work (no no-op override)", () => {
  // Source: spec.md > Requirement: A code-fixer no-op on a routed target is not silently accepted
  //         > Scenario: a finding-named document change still counts as work
  //
  // The findingTargetPaths exemption is preserved after D5. A change to the exact file
  // named by the finding is counted as real work and the verdict is NOT overridden.

  it("TC-012: finding names a change-folder doc, fixer modifies only that doc → verdict not overridden", async () => {
    const changeDoc = "specrunner/changes/example/implementation-notes.md";

    const runner = makeRunner();
    // Only the finding-named change folder doc changed (artifact prefix, but named by finding)
    const runtimeStrategy = makeRuntimeStrategy([changeDoc]);
    const store = makeStore();
    const storeFactory = () => store as never;
    const executor = new StepExecutor(
      new EventBus(),
      runner as never,
      storeFactory,
      makeGitRevParseSpawnFn("abc123head"),
    );

    const step = makeNoOpStep();
    // State: code-review needs-fix with a fixable finding targeting the change doc
    const state: JobState = {
      ...makeBaseState({}),
      step: "code-fixer",
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          makeCodeReviewRun("needs-fix", [
            makeFinding("high", "fixable", {
              file: changeDoc,
              title: "Update implementation notes",
            }),
          ]),
        ],
      } as unknown as JobState["steps"],
    };
    const deps = makeDeps(runtimeStrategy);
    deps.storeFactory = storeFactory;

    const resultState = await executor.execute(step, state, deps);

    const stepRuns = resultState.steps?.["code-fixer"] ?? [];
    const lastRun = stepRuns[stepRuns.length - 1];
    // findingTargetPaths exemption: the doc IS named by the finding → counts as work → no override
    expect(lastRun?.outcome.verdict).toBe("approved");
  });
});

// ===========================================================================
// TC-013: critical fixable finding also yields needs-fix (D6 invariant)
// ===========================================================================

describe("TC-013: critical fixable finding yields needs-fix (verdict semantics unchanged)", () => {
  // Source: design.md > D6 (verdict / 再レビュー要否の意味論は不変)
  //
  // GIVEN a findings array containing a critical + fixable finding and ok=true,
  //   with no decision-needed findings
  // WHEN deriveJudgeVerdict is called
  // THEN the verdict is needs-fix

  it("TC-013: deriveJudgeVerdict with critical fixable → needs-fix", () => {
    const findings = [makeFinding("critical", "fixable")];
    expect(deriveJudgeVerdict(findings, true)).toBe("needs-fix");
  });
});

// ===========================================================================
// TC-014: spec-fixer system prompt contains no severity-based re-filter
// ===========================================================================

describe("TC-014: SPEC_FIXER_SYSTEM_PROMPT contains no severity-based re-filter", () => {
  // Source: tasks.md > T-04 (Acceptance Criteria: spec-fixer system prompt は無変更)
  //
  // GIVEN the assembled SPEC_FIXER_SYSTEM_PROMPT content
  // WHEN its text is inspected for severity-filtering language
  // THEN it contains no instruction to ignore, skip, or condition findings based on low severity

  it("TC-014: spec-fixer system prompt has no LOW-ignore instruction", () => {
    expect(SPEC_FIXER_SYSTEM_PROMPT).not.toContain("LOW は無視");
    const prompt = SPEC_FIXER_SYSTEM_PROMPT.toLowerCase();
    expect(prompt).not.toMatch(/low.{0,30}ignore|ignore.{0,30}low|low.{0,30}skip|low.{0,30}無視/);
  });

  it("TC-014: spec-fixer system prompt is severity-neutral (no severity-tiered instructions)", () => {
    // The spec-fixer prompt should not have severity-based conditionals
    expect(SPEC_FIXER_SYSTEM_PROMPT).not.toContain("HIGH は必須");
    expect(SPEC_FIXER_SYSTEM_PROMPT).not.toContain("MEDIUM は設計変更不要");
  });
});

// ===========================================================================
// TC-015: code-fixer step message write-scope guards are preserved
// ===========================================================================

describe("TC-015: write-scope guards are preserved in code-fixer buildMessage", () => {
  // Source: tasks.md > T-03 (Acceptance Criteria: write-scope ガード行は保持する)
  //
  // GIVEN any non-continuation code-fixer message branch with at least one routed finding
  // WHEN buildMessage produces the prompt
  // THEN the prompt contains write-scope guard text prohibiting new features or spec changes

  it("TC-015: standard embedded branch preserves Do NOT add new features guard", () => {
    const state = makeBaseState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun("needs-fix", [
          makeFinding("high", "fixable"),
        ]),
      ],
    });
    const deps = makeMinimalDeps("test-slug");

    const msg = CodeFixerStep.buildMessage!(state, deps);

    // Write-scope guards must be present
    expect(msg).toContain("Do NOT add new features");
  });

  it("TC-015: findingsPath fallback branch preserves Do NOT add new features guard", () => {
    // Simulate null toolResult → findingsPath fallback branch
    const state = makeBaseState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: undefined,
          },
        },
      ],
    });
    const deps = makeMinimalDeps("test-slug");

    const msg = CodeFixerStep.buildMessage!(state, deps);

    expect(msg).toContain("Do NOT add new features");
    // Also check the "Do NOT modify the review-feedback file itself" guard
    expect(msg).toContain("Do NOT modify the review-feedback file itself");
  });
});
