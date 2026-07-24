/**
 * Tests for spec-review fixer routing.
 *
 * Source: specrunner/changes/spec-review-fixer-routing/test-cases.md
 *
 * TC IDs are frozen — do not renumber.
 *
 * TC-001: medium fixable finding on spec.md routes to spec-fixer
 * TC-002: low fixable finding on design.md routes to spec-fixer
 * TC-003: fixable finding on request.md escalates with reason
 * TC-004: escalation-and-routable coexistence prefers escalation
 * TC-005: routable spec.md finding yields no escalation reason
 * TC-006: unroutable request.md finding yields a canon escalation reason under the same resolver
 * TC-007: medium fixable finding on a non-canon file approves
 * TC-008: decision-needed finding escalates
 * TC-009: repeated needs-fix exhausts at the existing limit
 * TC-010: code-review canon escalation still uses the judge resolver
 * TC-011: specReviewEffectiveFixer always returns "spec-fixer" regardless of finding content
 * TC-012: selectRoutableCanonFindings returns only findings on spec-fixer-writable canon paths
 * TC-013: deriveSpecReviewVerdict — fixable finding on tasks.md escalates
 * TC-014: deriveSpecReviewVerdict — ok:false always escalates
 * TC-015: deriveSpecReviewVerdict — vacuous evidence (checked=0) escalates
 * TC-016: deriveSpecReviewVerdict — non-canon critical finding yields needs-fix
 * TC-017: SpecReviewStep.judgeVerdictFn is identity-equal to deriveSpecReviewVerdict
 * TC-018: spec-review step with ok:false escalation yields no escalationReason
 * TC-019: conformance step escalationReason resolver remains conformanceEffectiveFixer
 * TC-020: typecheck && test pass green (smoke: verifies the new exports are reachable)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Finding, FixTarget, Evidence } from "../../../kernel/report-result.js";
import {
  selectUnroutableCanonFindings,
  judgeEffectiveFixer,
  conformanceEffectiveFixer,
  buildCanonEscalationReason,
  type CanonWriteScope,
} from "../canon-escalation.js";
import { deriveJudgeVerdict } from "../judge-verdict.js";
import { SpecReviewStep } from "../spec-review.js";
import { JUDGE_REPORT_TOOL, CONFORMANCE_REPORT_TOOL } from "../report-tool.js";
import { deriveStepCompletion } from "../step-completion.js";
import type { Step } from "../types.js";
import type { JobState } from "../../../state/schema.js";
import type { PipelineDeps } from "../../types.js";
import { Pipeline } from "../../pipeline/pipeline.js";
import { EventBus } from "../../event/event-bus.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Dynamic access for new exports (RED phase: will be undefined until implementation)
// Pattern from verdict-channel-unification.test.ts: namespace import + dynamic cast.
// ---------------------------------------------------------------------------

import * as canonEscalationNS from "../canon-escalation.js";
import * as judgeVerdictNS from "../judge-verdict.js";

type EffectiveFixerFn = (f: Finding) => FixTarget;
type RoutableSelectorFn = (
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: EffectiveFixerFn,
) => Finding[];
type SpecReviewVerdictFn = (
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
  canonScope?: CanonWriteScope,
) => "approved" | "needs-fix" | "escalation";

/** T-01: specReviewEffectiveFixer — new export from canon-escalation.ts */
const specReviewEffectiveFixer = (canonEscalationNS as Record<string, unknown>)
  .specReviewEffectiveFixer as EffectiveFixerFn | undefined;

/** T-01: selectRoutableCanonFindings — new export from canon-escalation.ts */
const selectRoutableCanonFindings = (canonEscalationNS as Record<string, unknown>)
  .selectRoutableCanonFindings as RoutableSelectorFn | undefined;

/** T-02: deriveSpecReviewVerdict — new export from judge-verdict.ts */
const deriveSpecReviewVerdict = (judgeVerdictNS as Record<string, unknown>)
  .deriveSpecReviewVerdict as SpecReviewVerdictFn | undefined;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug";
const FOLDER = `specrunner/changes/${TEST_SLUG}`;
const SPEC_MD = `${FOLDER}/spec.md`;
const DESIGN_MD = `${FOLDER}/design.md`;
const TASKS_MD = `${FOLDER}/tasks.md`;
const TEST_CASES_MD = `${FOLDER}/test-cases.md`;
const REQUEST_MD = `specrunner/changes/${TEST_SLUG}/request.md`;
const ATTESTATION_PATH = `${FOLDER}/request-review-attestation.json`;

/** Minimal CanonWriteScope matching buildCanonWriteScope(state, { slug: TEST_SLUG }) */
function makeCanonScope(): CanonWriteScope {
  const canonPaths = new Set([
    REQUEST_MD,
    SPEC_MD,
    DESIGN_MD,
    TASKS_MD,
    TEST_CASES_MD,
    ATTESTATION_PATH,
  ]);
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    ["code-fixer", new Set<string>()],
    ["implementer", new Set<string>([TASKS_MD])],
    ["spec-fixer", new Set<string>([SPEC_MD, DESIGN_MD, TASKS_MD])],
  ]);
  return { canonPaths, writableByFixer };
}

function makeFinding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
  file: string = "src/example.ts",
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

function makeMinimalState(step: string = STEP_NAMES.SPEC_REVIEW): JobState {
  return {
    version: 2,
    jobId: "spec-review-routing-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: REQUEST_MD,
      title: "Spec Review Fixer Routing Test",
      type: "spec-change",
      slug: TEST_SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step,
    status: "running",
    branch: `change/${TEST_SLUG}-abc12345`,
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    slug: TEST_SLUG,
    cwd: "/tmp",
    config: { version: 1, agents: {} } as unknown as PipelineDeps["config"],
    request: {
      type: "spec-change",
      title: "Spec Review Fixer Routing Test",
      slug: TEST_SLUG,
      baseBranch: "main",
      content: "Test request content",
      adr: false,
      path: REQUEST_MD,
    },
    githubClient: {} as unknown as PipelineDeps["githubClient"],
    owner: "octo",
    repo: "repo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: (() => ({})) as unknown as PipelineDeps["storeFactory"],
    runner: {} as unknown as PipelineDeps["runner"],
    // runtimeStrategy absent → scope check, finding-ref verification skip
  } as unknown as PipelineDeps;
}

function makeMinimalJudgeStep(
  name: string,
  reportTool: typeof JUDGE_REPORT_TOOL | typeof CONFORMANCE_REPORT_TOOL = JUDGE_REPORT_TOOL,
): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name,
      model: "claude-sonnet-4-6",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    reportTool,
    buildMessage: () => "perform review",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

// ---------------------------------------------------------------------------
// TC-001
// Source: spec.md > Requirement: spec-review shall route fixable findings on spec-fixer-writable
//         canon files to spec-fixer regardless of severity
//         > Scenario: medium fixable finding on spec.md routes to spec-fixer
// Updated: #spec-observation-autofix — medium fixable on spec.md now approves (observation auto-fix)
// ---------------------------------------------------------------------------

describe("TC-001: medium fixable finding on spec.md routes to spec-fixer", () => {
  it("TC-001: deriveSpecReviewVerdict(medium fixable on spec.md) === 'approved'", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });

  it("TC-001: STANDARD_TRANSITIONS routes spec-review + needs-fix → spec-fixer", async () => {
    const { STANDARD_TRANSITIONS } = await import("../../pipeline/types.js");
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.SPEC_REVIEW && t.on === "needs-fix" && t.to === STEP_NAMES.SPEC_FIXER,
    );
    expect(row).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-002
// Source: spec.md > Requirement: spec-review shall route fixable findings on spec-fixer-writable
//         canon files to spec-fixer regardless of severity
//         > Scenario: low fixable finding on design.md routes to spec-fixer
// Updated: #spec-observation-autofix — low fixable on design.md now approves (observation auto-fix)
// ---------------------------------------------------------------------------

describe("TC-002: low fixable finding on design.md routes to spec-fixer", () => {
  it("TC-002: deriveSpecReviewVerdict(low fixable on design.md) === 'approved'", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("low", "fixable", DESIGN_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-003
// Source: spec.md > Requirement: spec-review shall escalate fixable findings on canon files
//         spec-fixer cannot write
//         > Scenario: fixable finding on request.md escalates with reason
// ---------------------------------------------------------------------------

describe("TC-003: fixable finding on request.md escalates with reason", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-003: verdict is escalation for fixable finding on request.md", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("medium", "fixable", REQUEST_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-003: deriveStepCompletion sets escalationReason containing CANON_FINDING_ESCALATION", async () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    // Inject the new judgeVerdictFn directly for the test (mirrors T-03 wiring)
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", REQUEST_MD)],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(REQUEST_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-004
// Source: spec.md > Requirement: spec-review shall escalate fixable findings on canon files
//         spec-fixer cannot write
//         > Scenario: escalation-and-routable coexistence prefers escalation
// ---------------------------------------------------------------------------

describe("TC-004: escalation-and-routable coexistence prefers escalation", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-004: both request.md (unroutable) and spec.md (routable) → escalation wins", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [
      makeFinding("medium", "fixable", REQUEST_MD),
      makeFinding("medium", "fixable", SPEC_MD),
    ];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-004: escalationReason is set and references request.md", async () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [
          makeFinding("medium", "fixable", REQUEST_MD),
          makeFinding("medium", "fixable", SPEC_MD),
        ],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(REQUEST_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-005
// Source: spec.md > Requirement: spec-review verdict derivation and escalationReason computation
//         shall reference the same effective fixer resolver
//         > Scenario: routable spec.md finding yields no escalation reason
// ---------------------------------------------------------------------------

describe("TC-005: routable spec.md finding yields no escalation reason", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-005: spec.md fixable (medium) finding → approved AND no escalationReason", async () => {
    // Updated: #spec-observation-autofix — medium fixable on spec.md now approves (observation auto-fix)
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", SPEC_MD)],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("approved");
    expect(completion.escalationReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-006
// Source: spec.md > Requirement: spec-review verdict derivation and escalationReason computation
//         shall reference the same effective fixer resolver
//         > Scenario: unroutable request.md finding yields a canon escalation reason under same resolver
// ---------------------------------------------------------------------------

describe("TC-006: unroutable request.md finding yields a canon escalation reason under the same resolver", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-006: request.md fixable → verdict escalation AND escalationReason contains CANON_FINDING_ESCALATION", async () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", REQUEST_MD)],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
  });
});

// ---------------------------------------------------------------------------
// TC-007
// Source: spec.md > Requirement: spec-review shall preserve existing non-canon verdict behavior
//         > Scenario: medium fixable finding on a non-canon file approves
// ---------------------------------------------------------------------------

describe("TC-007: medium fixable finding on a non-canon file approves", () => {
  it("TC-007: deriveSpecReviewVerdict(medium fixable on src/example.ts) === 'approved'", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-008
// Source: spec.md > Requirement: spec-review shall preserve existing non-canon verdict behavior
//         > Scenario: decision-needed finding escalates
// ---------------------------------------------------------------------------

describe("TC-008: decision-needed finding escalates", () => {
  it("TC-008: deriveSpecReviewVerdict with decision-needed finding → escalation", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("low", "decision-needed", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-008: decision-needed on a canon file also escalates", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("low", "decision-needed", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-009 (integration)
// Source: spec.md > Requirement: the spec-review→spec-fixer loop shall remain bounded by the
//         existing exhaustion limit
//         > Scenario: repeated needs-fix exhausts at the existing limit
// ---------------------------------------------------------------------------

describe("TC-009: repeated needs-fix exhausts at the existing limit (integration)", () => {
  function makeStore() {
    return {
      update: async (state: JobState, patch: Partial<JobState>) => ({ ...state, ...patch }),
      appendHistory: async (state: JobState, _entry: unknown) => state,
      fail: async (state: JobState) => state,
      persist: async (_state: JobState) => undefined,
      appendInterruption: async () => undefined,
      appendLineage: async () => undefined,
    };
  }

  function makeStepWithVerdict(name: string, _verdict: string): Step {
    return {
      kind: "agent",
      name,
      agent: {} as never,
      buildMessage: () => `${name} message`,
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    } as unknown as Step;
  }

  function makePipelineExecutor(store: ReturnType<typeof makeStore>) {
    return {
      execute: vi.fn(async (step: Step, state: JobState) => {
        const now = new Date().toISOString();
        // spec-review always returns needs-fix (via canon fixable finding on spec.md)
        // spec-fixer always returns approved
        const stepVerdict = step.name === STEP_NAMES.SPEC_REVIEW ? "needs-fix" : "approved";
        const stepRuns = [
          ...(state.steps?.[step.name] ?? []),
          {
            attempt: (state.steps?.[step.name]?.length ?? 0) + 1,
            sessionId: null,
            startedAt: now,
            endedAt: now,
            outcome: { verdict: stepVerdict as never, findingsPath: null, error: null },
          },
        ];
        const newState: JobState = {
          ...state,
          steps: { ...(state.steps ?? {}), [step.name]: stepRuns },
          updatedAt: now,
        };
        await store.persist(newState);
        return newState;
      }),
    };
  }

  it("TC-009: spec-review loop exhausts with SPEC_REVIEW_RETRIES_EXHAUSTED at maxIterations=2", async () => {
    const events = new EventBus();
    const store = makeStore();
    const executor = makePipelineExecutor(store);
    const storeFactory = () => store as never;

    const specReviewStep = makeStepWithVerdict(STEP_NAMES.SPEC_REVIEW, "needs-fix");
    const specFixerStep = makeStepWithVerdict(STEP_NAMES.SPEC_FIXER, "approved");

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.SPEC_REVIEW, specReviewStep],
        [STEP_NAMES.SPEC_FIXER, specFixerStep],
      ]),
      transitions: [
        { step: STEP_NAMES.SPEC_REVIEW, on: "needs-fix", to: STEP_NAMES.SPEC_FIXER },
        { step: STEP_NAMES.SPEC_REVIEW, on: "approved", to: "end" },
        { step: STEP_NAMES.SPEC_REVIEW, on: "escalation", to: "escalate" },
        { step: STEP_NAMES.SPEC_FIXER, on: "approved", to: STEP_NAMES.SPEC_REVIEW },
        { step: STEP_NAMES.SPEC_FIXER, on: "error", to: "escalate" },
      ],
      maxIterations: 2,
      loopName: STEP_NAMES.SPEC_REVIEW,
      loopNames: [STEP_NAMES.SPEC_REVIEW],
      loopFixerPairs: {
        [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
      },
      executor: executor as never,
      events,
    });

    const state: JobState = {
      version: 2,
      jobId: "tc-009-exhaustion-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: REQUEST_MD,
        title: "TC-009 test",
        type: "spec-change",
        slug: TEST_SLUG,
      },
      repository: { owner: "octo", name: "repo" },
      session: null,
      step: STEP_NAMES.SPEC_REVIEW,
      status: "running",
      branch: `change/${TEST_SLUG}-abc`,
      history: [],
      error: null,
      steps: {},
    };

    const deps: PipelineDeps = {
      cwd: "/tmp",
      slug: TEST_SLUG,
      config: {} as never,
      request: {
        type: "spec-change",
        title: "TC-009 test",
        slug: TEST_SLUG,
        baseBranch: "main",
        content: "Test",
        adr: false,
        path: REQUEST_MD,
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory,
      runner: {} as never,
      resumePrompt: undefined,
      resumeContext: undefined,
      runtimeStrategy: undefined,
    } as PipelineDeps;

    const finalState = await pipeline.run(STEP_NAMES.SPEC_REVIEW, state, deps);

    // TC-009 assertion: pipeline halts with SPEC_REVIEW_RETRIES_EXHAUSTED
    expect(finalState.status).toBe("awaiting-resume");
    expect(finalState.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });

  it("TC-009: no non-spec-review exhaustion error code is produced", async () => {
    const events = new EventBus();
    const store = makeStore();
    const executor = makePipelineExecutor(store);
    const storeFactory = () => store as never;

    const specReviewStep = makeStepWithVerdict(STEP_NAMES.SPEC_REVIEW, "needs-fix");
    const specFixerStep = makeStepWithVerdict(STEP_NAMES.SPEC_FIXER, "approved");

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.SPEC_REVIEW, specReviewStep],
        [STEP_NAMES.SPEC_FIXER, specFixerStep],
      ]),
      transitions: [
        { step: STEP_NAMES.SPEC_REVIEW, on: "needs-fix", to: STEP_NAMES.SPEC_FIXER },
        { step: STEP_NAMES.SPEC_REVIEW, on: "approved", to: "end" },
        { step: STEP_NAMES.SPEC_REVIEW, on: "escalation", to: "escalate" },
        { step: STEP_NAMES.SPEC_FIXER, on: "approved", to: STEP_NAMES.SPEC_REVIEW },
        { step: STEP_NAMES.SPEC_FIXER, on: "error", to: "escalate" },
      ],
      maxIterations: 2,
      loopName: STEP_NAMES.SPEC_REVIEW,
      loopNames: [STEP_NAMES.SPEC_REVIEW],
      loopFixerPairs: {
        [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
      },
      executor: executor as never,
      events,
    });

    const state: JobState = {
      version: 2,
      jobId: "tc-009-no-other-error",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: REQUEST_MD,
        title: "TC-009 test",
        type: "spec-change",
        slug: TEST_SLUG,
      },
      repository: { owner: "octo", name: "repo" },
      session: null,
      step: STEP_NAMES.SPEC_REVIEW,
      status: "running",
      branch: `change/${TEST_SLUG}-abc`,
      history: [],
      error: null,
      steps: {},
    };

    const deps: PipelineDeps = {
      cwd: "/tmp",
      slug: TEST_SLUG,
      config: {} as never,
      request: {
        type: "spec-change",
        title: "TC-009 test",
        slug: TEST_SLUG,
        baseBranch: "main",
        content: "Test",
        adr: false,
        path: REQUEST_MD,
      },
      dynamicContext: undefined,
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory,
      runner: {} as never,
      resumePrompt: undefined,
      resumeContext: undefined,
      runtimeStrategy: undefined,
    } as PipelineDeps;

    const finalState = await pipeline.run(STEP_NAMES.SPEC_REVIEW, state, deps);

    // No other error code — only SPEC_REVIEW_RETRIES_EXHAUSTED
    const errorCode = finalState.error?.code;
    expect(errorCode).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
    // Specifically NOT these other error codes
    expect(errorCode).not.toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
    expect(errorCode).not.toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(errorCode).not.toBe("CONFORMANCE_RETRIES_EXHAUSTED");
  });
});

// ---------------------------------------------------------------------------
// TC-010
// Source: spec.md > Requirement: other judge, conformance, regression-gate, and request-review
//         verdict derivation shall be unchanged
//         > Scenario: code-review canon escalation still uses the judge resolver
// ---------------------------------------------------------------------------

describe("TC-010: code-review canon escalation still uses the judge resolver", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-010: code-review + fixable finding on spec.md → verdict escalation (judgeEffectiveFixer used, not specReviewEffectiveFixer)", async () => {
    // judgeEffectiveFixer always returns "code-fixer"
    // code-fixer cannot write spec.md → unroutable → escalation
    // If specReviewEffectiveFixer were wrongly used, effective fixer = "spec-fixer"
    // spec-fixer CAN write spec.md → routable → needs-fix (not escalation)
    // Verdict = escalation proves judgeEffectiveFixer is used for code-review
    const step = makeMinimalJudgeStep(STEP_NAMES.CODE_REVIEW, JUDGE_REPORT_TOOL);
    // No judgeVerdictFn override → deriveJudgeVerdict is used (with judgeEffectiveFixer)

    const state = makeMinimalState(STEP_NAMES.CODE_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", SPEC_MD)],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    // With judgeEffectiveFixer: code-fixer can't write spec.md → escalation
    expect(completion.verdict).toBe("escalation");
    // escalationReason should be set (CANON_FINDING_ESCALATION from judgeEffectiveFixer path)
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
  });

  it("TC-010: deriveJudgeVerdict itself is unchanged — medium fixable on non-canon → approved", () => {
    // Regression guard: deriveJudgeVerdict (code-review path) must not be modified
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("approved");
  });

  it("TC-010: deriveJudgeVerdict is unchanged — critical fixable → needs-fix", () => {
    const findings = [makeFinding("critical", "fixable", "src/example.ts")];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-011
// Source: tasks.md > T-01
// GIVEN any Finding object
// WHEN specReviewEffectiveFixer(finding) is called
// THEN the return value is "spec-fixer" for all inputs
// ---------------------------------------------------------------------------

describe("TC-011: specReviewEffectiveFixer always returns 'spec-fixer' regardless of finding content", () => {
  it("TC-011: specReviewEffectiveFixer is exported from canon-escalation.ts", () => {
    expect(specReviewEffectiveFixer).toBeDefined();
  });

  it("TC-011: specReviewEffectiveFixer returns 'spec-fixer' for medium fixable finding", () => {
    expect(specReviewEffectiveFixer).toBeDefined();
    const f = makeFinding("medium", "fixable", SPEC_MD);
    expect(specReviewEffectiveFixer!(f)).toBe("spec-fixer");
  });

  it("TC-011: specReviewEffectiveFixer returns 'spec-fixer' for low fixable finding on request.md", () => {
    expect(specReviewEffectiveFixer).toBeDefined();
    const f = makeFinding("low", "fixable", REQUEST_MD);
    expect(specReviewEffectiveFixer!(f)).toBe("spec-fixer");
  });

  it("TC-011: specReviewEffectiveFixer returns 'spec-fixer' for critical decision-needed finding", () => {
    expect(specReviewEffectiveFixer).toBeDefined();
    const f = makeFinding("critical", "decision-needed", "src/example.ts");
    expect(specReviewEffectiveFixer!(f)).toBe("spec-fixer");
  });

  it("TC-011: specReviewEffectiveFixer returns 'spec-fixer' for finding with fixTarget code-fixer", () => {
    expect(specReviewEffectiveFixer).toBeDefined();
    const f = makeFinding("high", "fixable", "src/example.ts", "code-fixer");
    // Even with fixTarget: "code-fixer", specReviewEffectiveFixer ignores it and returns "spec-fixer"
    expect(specReviewEffectiveFixer!(f)).toBe("spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-012
// Source: tasks.md > T-01
// GIVEN a canon scope with mixed findings
// WHEN selectRoutableCanonFindings is called
// THEN only spec.md and design.md findings are returned
// ---------------------------------------------------------------------------

describe("TC-012: selectRoutableCanonFindings returns only findings on spec-fixer-writable canon paths", () => {
  it("TC-012: selectRoutableCanonFindings is exported from canon-escalation.ts", () => {
    expect(selectRoutableCanonFindings).toBeDefined();
  });

  it("TC-012: only spec-fixer-writable fixable findings are returned (request.md and src/ excluded)", () => {
    expect(selectRoutableCanonFindings).toBeDefined();
    expect(specReviewEffectiveFixer).toBeDefined();

    const scope = makeCanonScope();
    const findings: Finding[] = [
      makeFinding("medium", "fixable", SPEC_MD),       // routable (spec-fixer can write)
      makeFinding("low", "fixable", DESIGN_MD),         // routable (spec-fixer can write)
      makeFinding("high", "fixable", REQUEST_MD),       // unroutable (spec-fixer can't write)
      makeFinding("medium", "fixable", "src/example.ts"), // non-canon
    ];

    const routable = selectRoutableCanonFindings!(findings, scope, specReviewEffectiveFixer!);

    // spec.md and design.md are routable (tasks.md also routable but not in this test data)
    const routedFiles = routable.map((f) => f.file);
    expect(routedFiles).toContain(SPEC_MD);
    expect(routedFiles).toContain(DESIGN_MD);
    expect(routedFiles).not.toContain(REQUEST_MD);
    expect(routedFiles).not.toContain("src/example.ts");
    expect(routable).toHaveLength(2);
  });

  it("TC-012: selectRoutableCanonFindings is the complement of selectUnroutableCanonFindings for spec-review resolver", () => {
    expect(selectRoutableCanonFindings).toBeDefined();
    expect(specReviewEffectiveFixer).toBeDefined();

    const scope = makeCanonScope();
    const findings: Finding[] = [
      makeFinding("medium", "fixable", SPEC_MD),
      makeFinding("low", "fixable", DESIGN_MD),
      makeFinding("high", "fixable", REQUEST_MD),
      makeFinding("high", "fixable", TASKS_MD),
    ];

    const routable = selectRoutableCanonFindings!(findings, scope, specReviewEffectiveFixer!);
    const unroutable = selectUnroutableCanonFindings(findings, scope, specReviewEffectiveFixer!);

    // All canon fixable findings are partitioned: routable ∪ unroutable = all canon fixable
    const canonFixable = findings.filter(
      (f) => f.resolution === "fixable" && [...scope.canonPaths].includes(f.file),
    );
    expect(routable.length + unroutable.length).toBe(canonFixable.length);

    // No overlap
    const routableFiles = new Set(routable.map((f) => f.file));
    const unroutableFiles = new Set(unroutable.map((f) => f.file));
    for (const file of routableFiles) {
      expect(unroutableFiles.has(file)).toBe(false);
    }
  });

  it("TC-012: non-fixable canon findings are excluded from selectRoutableCanonFindings", () => {
    expect(selectRoutableCanonFindings).toBeDefined();
    expect(specReviewEffectiveFixer).toBeDefined();

    const scope = makeCanonScope();
    const findings: Finding[] = [
      makeFinding("low", "decision-needed", SPEC_MD),  // non-fixable, should be excluded
      makeFinding("medium", "fixable", SPEC_MD),        // fixable, should be included
    ];

    const routable = selectRoutableCanonFindings!(findings, scope, specReviewEffectiveFixer!);
    // Only the fixable one is routable
    expect(routable).toHaveLength(1);
    expect(routable[0]!.resolution).toBe("fixable");
  });
});

// ---------------------------------------------------------------------------
// TC-013
// Source: tasks.md > T-02 (updated: tasks.md is routable to spec-fixer)
// GIVEN spec-review result with ok:true and fixable finding on tasks.md
// WHEN deriveSpecReviewVerdict is called
// THEN verdict is approved (tasks.md is in spec-fixer's writable set; medium → observation auto-fix)
// Updated: #spec-observation-autofix — medium fixable on tasks.md now approves
//
// test-cases.md remains unroutable (escalation with escalationReason).
// ---------------------------------------------------------------------------

describe("TC-013: deriveSpecReviewVerdict — fixable finding on tasks.md routes to spec-fixer", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-013: fixable finding on tasks.md (routable to spec-fixer, medium) → approved (observation auto-fix)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    // tasks.md is in spec-fixer's writable set; medium severity → approved (observation auto-fix)
    const findings = [makeFinding("medium", "fixable", TASKS_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });

  it("TC-013: fixable finding on test-cases.md (unroutable for spec-fixer) → escalation", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("medium", "fixable", TEST_CASES_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-013: deriveStepCompletion sets escalationReason containing CANON_FINDING_ESCALATION and test-cases.md", async () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", TEST_CASES_MD)],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(TEST_CASES_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-014
// Source: tasks.md > T-02
// GIVEN spec-review result with ok:false and no findings
// WHEN deriveSpecReviewVerdict is called
// THEN verdict is escalation
// ---------------------------------------------------------------------------

describe("TC-014: deriveSpecReviewVerdict — ok:false always escalates", () => {
  it("TC-014: ok=false with empty findings → escalation", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const verdict = deriveSpecReviewVerdict!([], false, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-014: ok=false with fixable findings on spec.md → still escalation (ok:false takes priority)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, false, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-015
// Source: tasks.md > T-02
// GIVEN spec-review result with ok:true and evidence.checked=0
// WHEN deriveSpecReviewVerdict is called
// THEN verdict is escalation (vacuous check)
// ---------------------------------------------------------------------------

describe("TC-015: deriveSpecReviewVerdict — vacuous evidence (checked=0) escalates", () => {
  it("TC-015: checked=0 with empty findings → escalation (vacuous check)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const evidence = { checked: 0, skipped: 3, unverified: 0 };
    const verdict = deriveSpecReviewVerdict!([], true, evidence as Evidence, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-015: checked=0 with fixable spec.md finding → still escalation (vacuous check takes priority)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const evidence = { checked: 0, skipped: 0, unverified: 0 };
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, evidence as Evidence, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-015: checked>0 with spec.md fixable (medium) finding → approved (observation auto-fix, not vacuous)", () => {
    // Updated: #spec-observation-autofix — medium fixable on spec.md now approves (observation auto-fix)
    expect(deriveSpecReviewVerdict).toBeDefined();
    const evidence = { checked: 2, skipped: 0, unverified: 0 };
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict!(findings, true, evidence as Evidence, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-016
// Source: tasks.md > T-02
// GIVEN spec-review result with ok:true and critical fixable finding on non-canon file
// WHEN deriveSpecReviewVerdict is called
// THEN verdict is needs-fix
// ---------------------------------------------------------------------------

describe("TC-016: deriveSpecReviewVerdict — non-canon critical finding yields needs-fix", () => {
  it("TC-016: critical fixable finding on src/example.ts → needs-fix (not escalation, not approved)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("critical", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });

  it("TC-016: high fixable finding on non-canon file → needs-fix", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const findings = [makeFinding("high", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-017
// Source: tasks.md > T-03, T-05
// GIVEN the SpecReviewStep configuration object
// WHEN judgeVerdictFn field is accessed
// THEN it is strictly reference-equal to deriveSpecReviewVerdict
// ---------------------------------------------------------------------------

describe("TC-017: SpecReviewStep.judgeVerdictFn is identity-equal to deriveSpecReviewVerdict", () => {
  it("TC-017: deriveSpecReviewVerdict is defined (pre-condition)", () => {
    // If deriveSpecReviewVerdict is undefined, this assertion fails in red phase.
    expect(deriveSpecReviewVerdict).toBeDefined();
  });

  it("TC-017: SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict (reference equality)", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    // Pre-implementation: SpecReviewStep.judgeVerdictFn is undefined (not wired yet)
    // Post-implementation: it must be === deriveSpecReviewVerdict
    expect((SpecReviewStep as unknown as Record<string, unknown>).judgeVerdictFn).toBe(deriveSpecReviewVerdict);
  });
});

// ---------------------------------------------------------------------------
// TC-018
// Source: tasks.md > T-04
// GIVEN spec-review step result with ok:false and no findings
// WHEN deriveStepCompletion is called
// THEN verdict is escalation AND escalationReason is NOT set
// ---------------------------------------------------------------------------

describe("TC-018: spec-review step with ok:false escalation yields no escalationReason", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-018: ok:false escalation via spec-review has no escalationReason", async () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    const step = makeMinimalJudgeStep(STEP_NAMES.SPEC_REVIEW, JUDGE_REPORT_TOOL);
    (step as unknown as Record<string, unknown>).judgeVerdictFn = deriveSpecReviewVerdict;

    const state = makeMinimalState(STEP_NAMES.SPEC_REVIEW);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: false,
        findings: [],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    expect(completion.verdict).toBe("escalation");
    // Non-canon escalation (ok:false) must NOT set escalationReason
    expect(completion.escalationReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-019
// Source: tasks.md > T-04
// GIVEN conformance step result with ok:true and fixable finding on canon file with fixTarget: code-fixer
// WHEN deriveStepCompletion is called for conformance
// THEN escalationReason is computed using conformanceEffectiveFixer (finding's fixTarget respected)
// ---------------------------------------------------------------------------

describe("TC-019: conformance step escalationReason resolver remains conformanceEffectiveFixer", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-019: conformance + fixable finding on spec.md with fixTarget:code-fixer → escalation with escalationReason", async () => {
    // conformanceEffectiveFixer(f) = f.fixTarget = "code-fixer"
    // code-fixer cannot write spec.md → unroutable → escalation
    // If specReviewEffectiveFixer were wrongly used, spec-fixer can write spec.md → needs-fix
    // Verdict=escalation proves conformanceEffectiveFixer is used (not specReviewEffectiveFixer)
    const step = makeMinimalJudgeStep(STEP_NAMES.CONFORMANCE, CONFORMANCE_REPORT_TOOL);

    const state = makeMinimalState(STEP_NAMES.CONFORMANCE);
    const deps = makeMinimalDeps();

    const agentResult = {
      toolResult: {
        ok: true,
        findings: [makeFinding("medium", "fixable", SPEC_MD, "code-fixer")],
      },
      followUpAttempts: 0,
    };

    const completion = await deriveStepCompletion(
      step,
      state,
      deps,
      agentResult as never,
      undefined,
    );

    // With conformanceEffectiveFixer: fixTarget=code-fixer → code-fixer can't write spec.md → escalation
    expect(completion.verdict).toBe("escalation");
    // escalationReason is set (confirms conformanceEffectiveFixer path)
    expect(completion.escalationReason).toBeDefined();
    expect(completion.escalationReason).toContain("CANON_FINDING_ESCALATION");
    expect(completion.escalationReason).toContain(SPEC_MD);
  });

  it("TC-019: conformanceEffectiveFixer is unchanged — still uses finding.fixTarget", () => {
    // Regression guard: conformanceEffectiveFixer must return finding.fixTarget
    const findingWithTarget = makeFinding("medium", "fixable", SPEC_MD, "code-fixer");
    expect(conformanceEffectiveFixer(findingWithTarget)).toBe("code-fixer");

    const findingNoTarget = makeFinding("high", "fixable", SPEC_MD);
    // Default when fixTarget absent is "implementer"
    expect(conformanceEffectiveFixer(findingNoTarget)).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-020
// Source: tasks.md > T-06
// GIVEN the implementation changes for T-01 through T-05 are applied
// WHEN typecheck && test suite is executed
// THEN all type checks pass and all tests are green
//
// This is a CI-level integration check. Here we verify the smoke condition:
// all new exports are reachable after implementation.
// ---------------------------------------------------------------------------

describe("TC-020: typecheck && test pass green (smoke: new exports are reachable)", () => {
  it("TC-020: specReviewEffectiveFixer is exported from canon-escalation.ts", () => {
    // This will fail in red phase (undefined) and pass after T-01 implementation.
    expect(specReviewEffectiveFixer).toBeDefined();
    expect(typeof specReviewEffectiveFixer).toBe("function");
  });

  it("TC-020: selectRoutableCanonFindings is exported from canon-escalation.ts", () => {
    expect(selectRoutableCanonFindings).toBeDefined();
    expect(typeof selectRoutableCanonFindings).toBe("function");
  });

  it("TC-020: deriveSpecReviewVerdict is exported from judge-verdict.ts", () => {
    expect(deriveSpecReviewVerdict).toBeDefined();
    expect(typeof deriveSpecReviewVerdict).toBe("function");
  });

  it("TC-020: SpecReviewStep.judgeVerdictFn is defined after T-03", () => {
    expect((SpecReviewStep as unknown as Record<string, unknown>).judgeVerdictFn).toBeDefined();
  });

  it("TC-020: existing exports are not broken (regression guard)", () => {
    // These must remain present after the change
    expect(typeof judgeEffectiveFixer).toBe("function");
    expect(typeof conformanceEffectiveFixer).toBe("function");
    expect(typeof selectUnroutableCanonFindings).toBe("function");
    expect(typeof buildCanonEscalationReason).toBe("function");
    expect(typeof deriveJudgeVerdict).toBe("function");
  });
});
