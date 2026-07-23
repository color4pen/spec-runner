/**
 * Tests for spec-fixer-tasks-md-writable change.
 *
 * Source: specrunner/changes/spec-fixer-tasks-md-writable/test-cases.md
 *
 * TC IDs are frozen — do not renumber.
 *
 * TC-001: writes() exposes tasks.md alongside spec.md and design.md
 * TC-002: D5 canon-write-scope map grants spec-fixer tasks.md and excludes unroutable files
 * TC-003: medium fixable finding on tasks.md yields needs-fix
 * TC-004: spec-review needs-fix reaches spec-fixer in the transition table
 * TC-005: fixable finding on test-cases.md escalates with CANON_FINDING_ESCALATION reason
 * TC-006: fixable finding on request.md escalates with CANON_FINDING_ESCALATION reason
 * TC-007: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer
 * TC-008: conformance tasks.md finding with fixTarget code-fixer still escalates
 * TC-009: drift-guard confirms spec-fixer writes() equals its D5 map entry
 * TC-010: conformance-entry message names tasks.md as a fixable artifact
 * TC-011: spec-fixer system prompt write-set names tasks.md
 * TC-012: conformance tasks.md finding with fixTarget implementer yields needs-fix:implementer
 * TC-013: code-fixer D5 map entry remains empty (∅) after write-set expansion
 * TC-014: implementer D5 map entry remains {tasks.md} after write-set expansion
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Finding, FixTarget } from "../../../../src/kernel/report-result.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { StepDeps } from "../../../../src/core/port/step-types.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { AgentStep } from "../../../../src/core/port/step-types.js";
import { SpecFixerStep } from "../../../../src/core/step/spec-fixer.js";
import { buildCanonWriteScope } from "../../../../src/core/step/canon-write-scope.js";
import { deriveSpecReviewVerdict, deriveConformanceVerdict } from "../../../../src/core/step/judge-verdict.js";
import { deriveStepCompletion } from "../../../../src/core/step/step-completion.js";
import { JUDGE_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../../../src/prompts/spec-fixer-system.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { changeFolderPath } from "../../../../src/util/paths.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLUG = "test-slug";
const FOLDER = changeFolderPath(SLUG);

const SPEC_MD = `${FOLDER}/spec.md`;
const DESIGN_MD = `${FOLDER}/design.md`;
const TASKS_MD = `${FOLDER}/tasks.md`;
const TEST_CASES_MD = `${FOLDER}/test-cases.md`;
const REQUEST_MD = `${FOLDER}/request.md`;

function makeState(slug = SLUG): JobState {
  return {
    version: 2,
    jobId: "spec-fixer-tasks-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${slug}/request.md`,
      title: "spec-fixer tasks.md writable test",
      type: "spec-change",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: STEP_NAMES.SPEC_REVIEW,
    status: "running",
    branch: `change/${slug}-abc12345`,
    history: [],
    error: null,
    steps: {},
  } as unknown as JobState;
}

function makeDeps(slug = SLUG): StepDeps {
  return {
    slug,
    config: { version: 1, runtime: "managed", agents: {} } as StepDeps["config"],
    request: {
      type: "spec-change",
      title: "spec-fixer tasks.md writable test",
      slug,
      baseBranch: "main",
      content: "# Test request",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
  } as StepDeps;
}

function makePipelineDeps(slug = SLUG): PipelineDeps {
  return {
    slug,
    config: { version: 1, runtime: "managed", agents: {} } as PipelineDeps["config"],
    request: {
      type: "spec-change",
      title: "spec-fixer tasks.md writable test",
      slug,
      baseBranch: "main",
      content: "# Test request",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
    githubClient: {} as PipelineDeps["githubClient"],
    owner: "testowner",
    repo: "testrepo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: () => ({}) as PipelineDeps["storeFactory"],
  } as unknown as PipelineDeps;
}

function makeFinding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
  file: string,
  fixTarget?: FixTarget,
): Finding {
  return {
    severity,
    resolution,
    file,
    title: "test finding",
    rationale: "test rationale",
    ...(fixTarget !== undefined ? { fixTarget } : {}),
  };
}

/** Minimal AgentStep wired as a judge step for spec-review. */
function makeSpecReviewJudgeStep(): AgentStep {
  return {
    kind: "agent",
    name: STEP_NAMES.SPEC_REVIEW,
    agent: {
      name: "specrunner-spec-review",
      role: STEP_NAMES.SPEC_REVIEW,
      model: "claude-sonnet-4-6",
      system: "review",
      tools: [],
    },
    buildMessage: () => "perform spec review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: JUDGE_REPORT_TOOL,
  } as AgentStep;
}

// ---------------------------------------------------------------------------
// TC-001 (must): writes() exposes tasks.md alongside spec.md and design.md
//
// Source: spec.md > Requirement: spec-fixer SHALL declare tasks.md in its canon write-set
//         > Scenario: writes() exposes tasks.md alongside spec.md and design.md
//
// RED until: T-01 (spec-fixer.ts writes() updated to include tasks.md)
// ---------------------------------------------------------------------------

describe("TC-001: writes() exposes tasks.md alongside spec.md and design.md", () => {
  it("TC-001: SpecFixerStep.writes() returns a path including tasks.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const refs = SpecFixerStep.writes!(state, deps);
    const paths = refs.map((r) => r.path);
    expect(paths).toContain(TASKS_MD);
  });

  it("TC-001: SpecFixerStep.writes() still returns spec.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const refs = SpecFixerStep.writes!(state, deps);
    const paths = refs.map((r) => r.path);
    expect(paths).toContain(SPEC_MD);
  });

  it("TC-001: SpecFixerStep.writes() still returns design.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const refs = SpecFixerStep.writes!(state, deps);
    const paths = refs.map((r) => r.path);
    expect(paths).toContain(DESIGN_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-002 (must): D5 canon-write-scope map grants spec-fixer tasks.md and
//                excludes unroutable files
//
// Source: spec.md > Requirement: spec-fixer SHALL declare tasks.md in its canon write-set
//         > Scenario: the D5 canon-write-scope map grants spec-fixer tasks.md
//
// RED until: T-01 (canon-write-scope.ts D5 map updated to include tasks.md)
// ---------------------------------------------------------------------------

describe("TC-002: D5 canon-write-scope map grants spec-fixer tasks.md and excludes unroutable files", () => {
  it("TC-002: writableByFixer.get('spec-fixer') contains tasks.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();
    expect(specFixer.has(TASKS_MD)).toBe(true);
  });

  it("TC-002: writableByFixer.get('spec-fixer') still contains spec.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();
    expect(specFixer.has(SPEC_MD)).toBe(true);
  });

  it("TC-002: writableByFixer.get('spec-fixer') still contains design.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();
    expect(specFixer.has(DESIGN_MD)).toBe(true);
  });

  it("TC-002: writableByFixer.get('spec-fixer') does NOT contain request.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();
    expect(specFixer.has(REQUEST_MD)).toBe(false);
  });

  it("TC-002: writableByFixer.get('spec-fixer') does NOT contain test-cases.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();
    expect(specFixer.has(TEST_CASES_MD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003 (must): medium fixable finding on tasks.md yields needs-fix
//
// Source: spec.md > Requirement: spec-review SHALL route fixable tasks.md findings
//         to spec-fixer regardless of severity
//         > Scenario: medium fixable finding on tasks.md yields needs-fix
//
// RED until: T-01 (canon-write-scope.ts D5 map adds tasks.md to spec-fixer set)
// After impl: buildCanonWriteScope returns spec-fixer → {spec.md, design.md, tasks.md}
// → deriveSpecReviewVerdict routes tasks.md finding to spec-fixer → needs-fix
// ---------------------------------------------------------------------------

describe("TC-003: medium fixable finding on tasks.md yields needs-fix", () => {
  it("TC-003: deriveSpecReviewVerdict(medium fixable on tasks.md, real canonScope) === 'needs-fix'", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("medium", "fixable", TASKS_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-003: no escalationReason is set when tasks.md finding routes to spec-fixer", async () => {
    const step = makeSpecReviewJudgeStep();
    // Wire judgeVerdictFn = deriveSpecReviewVerdict (post-implementation wiring)
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeState();
    const deps = makePipelineDeps();

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: true,
          findings: [makeFinding("medium", "fixable", TASKS_MD)],
        },
        followUpAttempts: 0,
      },
      undefined,
    );

    expect(completion.verdict).toBe("needs-fix");
    expect(completion.escalationReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-004 (must): spec-review needs-fix reaches spec-fixer in the transition table
//
// Source: spec.md > Requirement: spec-review SHALL route fixable tasks.md findings
//         to spec-fixer regardless of severity
//         > Scenario: spec-review needs-fix reaches spec-fixer in the transition table
//
// GREEN from the start: the transition already exists in STANDARD_TRANSITIONS
// ---------------------------------------------------------------------------

describe("TC-004: spec-review needs-fix reaches spec-fixer in the transition table", () => {
  it("TC-004: STANDARD_TRANSITIONS has spec-review + needs-fix → spec-fixer", async () => {
    const { STANDARD_TRANSITIONS } = await import("../../../../src/core/pipeline/types.js");
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.SPEC_REVIEW && t.on === "needs-fix" && t.to === STEP_NAMES.SPEC_FIXER,
    );
    expect(row).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-005 (must): fixable finding on test-cases.md escalates with CANON_FINDING_ESCALATION reason
//
// Source: spec.md > Requirement: spec-review SHALL keep escalating fixable findings
//         on canon files spec-fixer cannot write
//         > Scenario: fixable finding on test-cases.md escalates with reason
//
// GREEN from the start: test-cases.md is never in spec-fixer's write set
// (boundary preserved whether or not tasks.md is added)
// ---------------------------------------------------------------------------

describe("TC-005: fixable finding on test-cases.md escalates with CANON_FINDING_ESCALATION reason", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-005: verdict is escalation for fixable finding on test-cases.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("medium", "fixable", TEST_CASES_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("escalation");
  });

  it("TC-005: deriveStepCompletion sets escalationReason containing CANON_FINDING_ESCALATION and test-cases.md", async () => {
    const step = makeSpecReviewJudgeStep();
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeState();
    const deps = makePipelineDeps();

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: true,
          findings: [makeFinding("medium", "fixable", TEST_CASES_MD)],
        },
        followUpAttempts: 0,
      },
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(TEST_CASES_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-006 (must): fixable finding on request.md escalates with CANON_FINDING_ESCALATION reason
//
// Source: spec.md > Requirement: spec-review SHALL keep escalating fixable findings
//         on canon files spec-fixer cannot write
//         > Scenario: fixable finding on request.md escalates with reason
//
// GREEN from the start: request.md is never in spec-fixer's write set
// ---------------------------------------------------------------------------

describe("TC-006: fixable finding on request.md escalates with CANON_FINDING_ESCALATION reason", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-006: verdict is escalation for fixable finding on request.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("medium", "fixable", REQUEST_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("escalation");
  });

  it("TC-006: deriveStepCompletion sets escalationReason containing CANON_FINDING_ESCALATION", async () => {
    const step = makeSpecReviewJudgeStep();
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeState();
    const deps = makePipelineDeps();

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      {
        toolResult: {
          ok: true,
          findings: [makeFinding("medium", "fixable", REQUEST_MD)],
        },
        followUpAttempts: 0,
      },
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(REQUEST_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-007 (should): conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer
//
// Source: spec.md > Requirement: conformance routing of tasks.md findings SHALL follow
//         the expanded write-set
//         > Scenario: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer
//
// RED until: T-01 (D5 map adds tasks.md to spec-fixer set)
// After impl: spec-fixer can write tasks.md → needs-fix:spec-fixer
// ---------------------------------------------------------------------------

describe("TC-007: conformance tasks.md finding with fixTarget spec-fixer routes to spec-fixer", () => {
  it("TC-007: deriveConformanceVerdict(tasks.md, fixTarget:spec-fixer, real scope) === 'needs-fix:spec-fixer'", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("high", "fixable", TASKS_MD, "spec-fixer")];
    const verdict = deriveConformanceVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("needs-fix:spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-008 (should): conformance tasks.md finding with fixTarget code-fixer still escalates
//
// Source: spec.md > Requirement: conformance routing of tasks.md findings SHALL follow
//         the expanded write-set
//         > Scenario: conformance tasks.md finding with fixTarget code-fixer still escalates
//
// GREEN from the start: code-fixer's write set is always ∅ (cannot write tasks.md)
// ---------------------------------------------------------------------------

describe("TC-008: conformance tasks.md finding with fixTarget code-fixer still escalates", () => {
  it("TC-008: deriveConformanceVerdict(tasks.md, fixTarget:code-fixer, real scope) === 'escalation'", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("high", "fixable", TASKS_MD, "code-fixer")];
    const verdict = deriveConformanceVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-009 (must): drift-guard confirms spec-fixer writes() equals its D5 map entry
//
// Source: spec.md > Requirement: the write-set declaration SHALL remain drift-guarded
//         across its synchronization points
//         > Scenario: drift-guard confirms spec-fixer writes() equals its D5 map entry
//         ({spec.md, design.md, tasks.md})
//
// RED until: T-01 both writes() and D5 map include tasks.md consistently
// ---------------------------------------------------------------------------

describe("TC-009: drift-guard confirms spec-fixer writes() equals its D5 map entry", () => {
  it("TC-009: writes() ∩ canonPaths includes tasks.md (three-file set)", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);

    const specFixerWritePaths = (SpecFixerStep.writes ? SpecFixerStep.writes(state, deps) : [])
      .filter((ref) => !("artifact" in ref && ref.artifact === "gitState"))
      .map((ref) => ref.path);
    const actualCanonIntersection = specFixerWritePaths.filter((p) => scope.canonPaths.has(p));

    expect(actualCanonIntersection).toContain(TASKS_MD);
  });

  it("TC-009: writes() ∩ canonPaths === D5 map spec-fixer entry (drift-guard)", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set<string>();

    const specFixerWritePaths = (SpecFixerStep.writes ? SpecFixerStep.writes(state, deps) : [])
      .filter((ref) => !("artifact" in ref && ref.artifact === "gitState"))
      .map((ref) => ref.path);
    const actualCanonIntersection = specFixerWritePaths.filter((p) => scope.canonPaths.has(p));

    // Drift-guard: explicit D5 map must equal writes() ∩ canonPaths
    expect(specFixer.size).toBe(actualCanonIntersection.length);
    for (const p of actualCanonIntersection) {
      expect(specFixer.has(p)).toBe(true);
    }
  });

  it("TC-009: writes() ∩ canonPaths contains exactly {spec.md, design.md, tasks.md}", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);

    const specFixerWritePaths = (SpecFixerStep.writes ? SpecFixerStep.writes(state, deps) : [])
      .filter((ref) => !("artifact" in ref && ref.artifact === "gitState"))
      .map((ref) => ref.path);
    const actualCanonIntersection = new Set(
      specFixerWritePaths.filter((p) => scope.canonPaths.has(p)),
    );

    expect(actualCanonIntersection.has(SPEC_MD)).toBe(true);
    expect(actualCanonIntersection.has(DESIGN_MD)).toBe(true);
    expect(actualCanonIntersection.has(TASKS_MD)).toBe(true);
    expect(actualCanonIntersection.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// TC-010 (should): conformance-entry message names tasks.md as a fixable artifact
//
// Source: spec.md > Requirement: the spec-fixer prompt SHALL name tasks.md as a fixable target
//         > Scenario: conformance-entry message names tasks.md
//
// RED until: T-02 (spec-fixer.ts conformance-entry message updated to include tasks.md)
//
// The current instruction says "fix the spec.md or design.md artifact" — it must
// be updated to mention tasks.md as well (e.g. "fix the spec.md, design.md, or tasks.md artifact").
// ---------------------------------------------------------------------------

describe("TC-010: conformance-entry message names tasks.md as a fixable artifact", () => {
  it("TC-010: buildMessage fix instruction does not omit tasks.md (old phrase 'spec.md or design.md artifact' absent)", () => {
    // Construct a state where getConformanceFixContext returns non-null findings.
    // Use a finding on spec.md (not tasks.md) so any mention of tasks.md in the
    // message must come from the instruction text itself, not the finding block.
    const now = "2026-01-02T00:00:00.000Z";
    const state: JobState = {
      ...makeState(),
      step: STEP_NAMES.SPEC_FIXER,
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-02T00:00:00.000Z",
            endedAt: now,
            outcome: {
              verdict: `needs-fix:${STEP_NAMES.SPEC_FIXER}`,
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [
                  // Use spec.md finding — tasks.md must come from the instruction, not the finding
                  makeFinding("high", "fixable", SPEC_MD, "spec-fixer"),
                ],
              },
            },
          },
        ],
      },
    } as unknown as JobState;

    const deps = makeDeps();
    const message = SpecFixerStep.buildMessage(state, deps);

    // After implementation, the fix instruction must name tasks.md alongside spec.md/design.md.
    // The old phrase "spec.md or design.md artifact" (without tasks.md) must no longer appear.
    expect(message).not.toContain("spec.md or design.md artifact");
    // And the new instruction must name tasks.md
    expect(message).toContain("tasks.md");
  });
});

// ---------------------------------------------------------------------------
// TC-011 (should): spec-fixer system prompt write-set names tasks.md
//
// Source: spec.md > Requirement: the spec-fixer prompt SHALL name tasks.md as a fixable target
//         > Scenario: system prompt write-set names tasks.md
//
// RED until: T-02 (spec-fixer-system.ts write-set section updated to include tasks.md)
// ---------------------------------------------------------------------------

describe("TC-011: spec-fixer system prompt write-set names tasks.md", () => {
  it("TC-011: SPEC_FIXER_SYSTEM_PROMPT contains 'tasks.md' in the write-set section", () => {
    expect(SPEC_FIXER_SYSTEM_PROMPT).toContain("tasks.md");
  });
});

// ---------------------------------------------------------------------------
// TC-012 (should): conformance tasks.md finding with fixTarget implementer yields needs-fix:implementer
//
// Source: tasks.md > T-05 Acceptance Criteria
//
// GREEN from the start: implementer can write tasks.md (existing D5 map entry)
// ---------------------------------------------------------------------------

describe("TC-012: conformance tasks.md finding with fixTarget implementer yields needs-fix:implementer", () => {
  it("TC-012: deriveConformanceVerdict(tasks.md, fixTarget:implementer, real scope) === 'needs-fix:implementer'", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const findings = [makeFinding("high", "fixable", TASKS_MD, "implementer")];
    const verdict = deriveConformanceVerdict(findings, true, undefined, scope);
    expect(verdict).toBe("needs-fix:implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-013 (could): code-fixer D5 map entry remains empty (∅) after write-set expansion
//
// Source: tasks.md > T-01 (do NOT change the code-fixer entry)
//
// GREEN from the start: code-fixer entry is not affected by the spec-fixer write-set expansion
// ---------------------------------------------------------------------------

describe("TC-013: code-fixer D5 map entry remains empty (∅) after write-set expansion", () => {
  it("TC-013: writableByFixer.get('code-fixer') is empty (∅)", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer") ?? new Set();
    expect(codeFixer.size).toBe(0);
  });

  it("TC-013: code-fixer entry does not contain tasks.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer") ?? new Set();
    expect(codeFixer.has(TASKS_MD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-014 (could): implementer D5 map entry remains {tasks.md} after write-set expansion
//
// Source: tasks.md > T-01 (do NOT change the implementer entry)
//
// GREEN from the start: implementer entry is not affected by the spec-fixer write-set expansion
// ---------------------------------------------------------------------------

describe("TC-014: implementer D5 map entry remains {tasks.md} after write-set expansion", () => {
  it("TC-014: writableByFixer.get('implementer') contains exactly tasks.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();
    expect(implementer.has(TASKS_MD)).toBe(true);
    expect(implementer.size).toBe(1);
  });

  it("TC-014: implementer entry does not contain spec.md or design.md", () => {
    const state = makeState();
    const deps = makeDeps();
    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();
    expect(implementer.has(SPEC_MD)).toBe(false);
    expect(implementer.has(DESIGN_MD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015: FAST pipeline — needs-fix:spec-fixer has no transition row (design D3)
//
// FAST_TRANSITIONS intentionally has no `needs-fix:spec-fixer` row, so a fixable
// conformance finding on tasks.md with fixTarget: spec-fixer derives
// `needs-fix:spec-fixer` and falls through the no-matching-transition default to
// the `escalate` terminal (pipeline.ts `transition?.to ?? "escalate"`), WITHOUT a
// CANON_FINDING_ESCALATION escalationReason. This pins the reason-less fail-closed
// halt as a documented contract (design.md D3 Consequence), not an accident.
// ---------------------------------------------------------------------------

describe("TC-015: FAST pipeline routes needs-fix:spec-fixer to the escalate fallback (design D3)", () => {
  it("TC-015: FAST_TRANSITIONS has no needs-fix:spec-fixer row", async () => {
    const { FAST_TRANSITIONS } = await import("../../../../src/core/pipeline/types.js");
    expect(FAST_TRANSITIONS.some((t) => t.on === "needs-fix:spec-fixer")).toBe(false);
  });

  it("TC-015: STANDARD_TRANSITIONS has the conformance needs-fix:spec-fixer → spec-fixer row (contrast pin)", async () => {
    const { STANDARD_TRANSITIONS } = await import("../../../../src/core/pipeline/types.js");
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "conformance" && t.on === "needs-fix:spec-fixer",
    );
    expect(row?.to).toBe("spec-fixer");
  });
});
