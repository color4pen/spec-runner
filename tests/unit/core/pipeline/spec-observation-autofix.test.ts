/**
 * Tests for spec フェーズの observation auto-fix
 *
 * Source: specrunner/changes/spec-observation-autofix/test-cases.md
 *
 * TC IDs are frozen — do not renumber.
 *
 * TC-001: medium fixable on spec.md approves
 * TC-002: low fixable on design.md approves
 * TC-003: high fixable on spec.md remains needs-fix
 * TC-004: critical fixable on spec.md remains needs-fix
 * TC-005: unroutable request.md fixable finding still escalates
 * TC-006: approved with routable fixable routes to spec-fixer
 * TC-007: approved with no routable fixable routes to test-case-gen
 * TC-008: observation-pass spec-fixer forwards to test-case-gen
 * TC-009: needs-fix spec-fixer returns to spec-review
 * TC-010: conformance-triggered spec-fixer returns to spec-review
 * TC-011: consumed spec-review fixable finding appears in the regression-gate ledger
 * TC-012: regression-gate is not skipped for spec-review-only ledger
 * TC-013: observation pass runs spec-review exactly once
 * TC-014: code-review verdict derivation is unchanged
 * TC-015: FAST transitions contain no spec-review / spec-fixer / test-case-gen rows
 * TC-016: medium fixable on tasks.md approves
 * TC-017: non-canon medium fixable on implementation file approves
 * TC-018: non-canon critical or high fixable remains needs-fix
 * TC-019: decision-needed finding escalates
 * TC-020: ok:false escalates
 * TC-021: vacuous check (evidence.checked = 0) escalates
 * TC-022: unroutable and routable findings coexist — unroutable escalation wins
 * TC-023: buildCanonWriteScopeFromState returns same scope as buildCanonWriteScope
 * TC-024: specReviewHasRoutableFixables is false when only non-canon fixable finding present
 * TC-025: specReviewHasRoutableFixables is false when no spec-review runs exist
 * TC-026: specFixerForwardsToTestGen is false when no spec-review runs exist
 * TC-027: high fixable verdict path — full needs-fix loop
 * TC-028: request.md spec-review fixable finding is excluded from ledger with canonScope
 * TC-029: STANDARD_TRANSITIONS length is 46 after adding two guarded rows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Finding, FixTarget, Evidence } from "../../../../src/kernel/report-result.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { CanonWriteScope } from "../../../../src/core/step/canon-escalation.js";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../../../../src/core/pipeline/types.js";
import { deriveSpecReviewVerdict, deriveJudgeVerdict } from "../../../../src/core/step/judge-verdict.js";
import { buildCanonWriteScope } from "../../../../src/core/step/canon-write-scope.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { getJobSlug } from "../../../../src/state/job-slug.js";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { Step } from "../../../../src/core/step/types.js";

// Namespace imports for new exports on existing modules (RED if not yet implemented)
import * as canonWriteScopeNS from "../../../../src/core/step/canon-write-scope.js";
import * as findingsLedgerNS from "../../../../src/core/pipeline/findings-ledger.js";

// ---------------------------------------------------------------------------
// Type declarations for new exports (not yet implemented — undefined in RED phase)
// ---------------------------------------------------------------------------

type BuildCanonWriteScopeFromStateFn = (state: JobState) => CanonWriteScope;
type CollectSpecReviewLedgerFn = (state: JobState, canonScope?: CanonWriteScope) => Finding[];

/** buildCanonWriteScopeFromState — new export on canon-write-scope.ts (T-02) */
const buildCanonWriteScopeFromState = (canonWriteScopeNS as Record<string, unknown>)
  .buildCanonWriteScopeFromState as BuildCanonWriteScopeFromStateFn | undefined;

/** collectSpecReviewLedger — new export on findings-ledger.ts (T-05) */
const collectSpecReviewLedger = (findingsLedgerNS as Record<string, unknown>)
  .collectSpecReviewLedger as CollectSpecReviewLedgerFn | undefined;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug";
const FOLDER = `specrunner/changes/${TEST_SLUG}`;
const SPEC_MD = `${FOLDER}/spec.md`;
const DESIGN_MD = `${FOLDER}/design.md`;
const TASKS_MD = `${FOLDER}/tasks.md`;
const TEST_CASES_MD = `${FOLDER}/test-cases.md`;
const REQUEST_MD = `${FOLDER}/request.md`;
const ATTESTATION_PATH = `${FOLDER}/request-review-attestation.json`;

/**
 * Minimal CanonWriteScope matching buildCanonWriteScope(state, { slug: TEST_SLUG }).
 * spec-fixer writable: {spec.md, design.md, tasks.md}.
 */
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
  file: string,
): Finding {
  return {
    severity,
    resolution,
    file,
    title: "test finding",
    rationale: "test rationale",
  };
}

function makeMinimalJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "spec-obs-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: REQUEST_MD,
      title: "Spec Observation Autofix Test",
      type: "spec-change",
      slug: TEST_SLUG,
    },
    repository: { owner: "octo", name: "repo" },
    session: null,
    step: STEP_NAMES.SPEC_REVIEW,
    status: "running",
    branch: `change/${TEST_SLUG}-abc12345`,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/** Build a StepRun with optional findings in toolResult. */
function makeStepRun(opts: {
  verdict: string;
  findings?: Finding[];
  startedAt?: string;
  endedAt?: string;
  attempt?: number;
}): StepRun {
  return {
    attempt: opts.attempt ?? 1,
    sessionId: null,
    startedAt: opts.startedAt ?? "2026-01-01T00:00:00.000Z",
    endedAt: opts.endedAt ?? "2026-01-01T00:00:00.000Z",
    outcome: {
      verdict: opts.verdict as never,
      findingsPath: null,
      error: null,
      toolResult:
        opts.findings && opts.findings.length > 0
          ? { ok: true, findings: opts.findings }
          : undefined,
    },
  };
}

function makeStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as never,
      model: "claude-sonnet-4-6",
      system: "",
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  } as unknown as Step;
}

// ---------------------------------------------------------------------------
// TC-001: medium fixable finding on spec.md approves
// Source: spec.md > Requirement: spec-review shall approve when only low/medium routable
//         canon fixable findings remain > Scenario: medium fixable finding on spec.md approves
// RED: current deriveSpecReviewVerdict returns "needs-fix" for routable canon fixable (severity-independent)
// ---------------------------------------------------------------------------

describe("TC-001: medium fixable finding on spec.md approves", () => {
  it("TC-001: deriveSpecReviewVerdict(medium fixable on spec.md) === 'approved'", () => {
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-002: low fixable finding on design.md approves
// Source: spec.md > Requirement: spec-review shall approve when only low/medium routable
//         canon fixable findings remain > Scenario: low fixable finding on design.md approves
// RED: current deriveSpecReviewVerdict returns "needs-fix" for routable canon fixable
// ---------------------------------------------------------------------------

describe("TC-002: low fixable finding on design.md approves", () => {
  it("TC-002: deriveSpecReviewVerdict(low fixable on design.md) === 'approved'", () => {
    const findings = [makeFinding("low", "fixable", DESIGN_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-003: high fixable finding on spec.md remains needs-fix
// Source: spec.md > Requirement: spec-review shall approve when only low/medium routable
//         canon fixable findings remain > Scenario: high fixable finding on spec.md remains needs-fix
// GREEN: current code returns "needs-fix" for high fixable routable canon finding
// ---------------------------------------------------------------------------

describe("TC-003: high fixable finding on spec.md remains needs-fix", () => {
  it("TC-003: deriveSpecReviewVerdict(high fixable on spec.md) === 'needs-fix'", () => {
    const findings = [makeFinding("high", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-004: critical fixable finding on spec.md remains needs-fix
// Source: spec.md > Requirement: spec-review shall approve when only low/medium routable
//         canon fixable findings remain > Scenario: critical fixable finding on spec.md remains needs-fix
// GREEN: current code returns "needs-fix" for critical fixable routable canon finding
// ---------------------------------------------------------------------------

describe("TC-004: critical fixable finding on spec.md remains needs-fix", () => {
  it("TC-004: deriveSpecReviewVerdict(critical fixable on spec.md) === 'needs-fix'", () => {
    const findings = [makeFinding("critical", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-005: unroutable request.md fixable finding still escalates
// Source: spec.md > Requirement: spec-review shall approve when only low/medium routable
//         canon fixable findings remain > Scenario: unroutable request.md fixable finding still escalates
// GREEN: current code escalates for unroutable canon fixable finding (4a priority unchanged)
// ---------------------------------------------------------------------------

describe("TC-005: unroutable request.md fixable finding still escalates", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-005: deriveSpecReviewVerdict(fixable on request.md) === 'escalation'", () => {
    const findings = [makeFinding("medium", "fixable", REQUEST_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-006: approved with routable fixable routes to spec-fixer
// Source: spec.md > Requirement: spec-review approval with routable fixable findings shall
//         route to spec-fixer > Scenario: approved with routable fixable routes to spec-fixer
// RED: STANDARD_TRANSITIONS does not yet have the guarded spec-review approved → spec-fixer row
// ---------------------------------------------------------------------------

describe("TC-006: approved with routable fixable routes to spec-fixer", () => {
  it("TC-006: STANDARD_TRANSITIONS has spec-review approved → spec-fixer with when predicate", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER,
    );
    // Row must exist (RED: does not exist yet)
    expect(row).toBeDefined();
    // The row must have a when predicate (guards against false-positive from needs-fix routing)
    expect(row!.when).toBeDefined();
  });

  it("TC-006: when predicate returns true for state with medium routable fixable on spec.md", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER,
    );
    expect(row).toBeDefined();
    expect(row!.when).toBeDefined();

    // Build a state with spec-review approved + medium fixable on spec.md
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    // when(state) must return true → routes to spec-fixer
    expect(row!.when!(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007: approved with no routable fixable routes to test-case-gen
// Source: spec.md > Requirement: spec-review approval with routable fixable findings shall
//         route to spec-fixer > Scenario: approved with no routable fixable routes to test-case-gen
// GREEN: unconditional spec-review approved → test-case-gen row exists
// RED partial: when predicate for the guarded row must return false for state with no routable fixables
// ---------------------------------------------------------------------------

describe("TC-007: approved with no routable fixable routes to test-case-gen", () => {
  it("TC-007: STANDARD_TRANSITIONS has unconditional spec-review approved → test-case-gen row", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-007: guarded spec-review approved → spec-fixer when predicate returns false for non-canon fixable only", () => {
    const guardedRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER,
    );
    // If the guarded row doesn't exist yet, this test fails (RED)
    expect(guardedRow).toBeDefined();
    expect(guardedRow!.when).toBeDefined();

    // State with only non-canon fixable (no routable fixable)
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    // when(state) must return false → falls through to test-case-gen
    expect(guardedRow!.when!(state)).toBe(false);
  });

  it("TC-007: guarded when predicate returns false for state with no spec-review runs", () => {
    const guardedRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER,
    );
    expect(guardedRow).toBeDefined();
    expect(guardedRow!.when).toBeDefined();

    const state = makeMinimalJobState(); // no steps
    expect(guardedRow!.when!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-008: observation-pass spec-fixer forwards to test-case-gen
// Source: spec.md > Requirement: spec-fixer following a spec-review approval shall forward to
//         test-case-gen without re-review > Scenario: observation-pass spec-fixer forwards to test-case-gen
// RED: STANDARD_TRANSITIONS does not yet have the guarded spec-fixer approved → test-case-gen row
// ---------------------------------------------------------------------------

describe("TC-008: observation-pass spec-fixer forwards to test-case-gen", () => {
  it("TC-008: STANDARD_TRANSITIONS has spec-fixer approved → test-case-gen with when predicate", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN,
    );
    // Row must exist (RED: does not exist yet)
    expect(row).toBeDefined();
    expect(row!.when).toBeDefined();
  });

  it("TC-008: when predicate returns true for observation-pass state (spec-review approved, no conformance context)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN,
    );
    expect(row).toBeDefined();
    expect(row!.when).toBeDefined();

    // State where:
    // - Latest spec-review run verdict is "approved" (observation pass entry)
    // - No conformance needs-fix:spec-fixer context (spec-fixer not triggered by conformance)
    const specReviewTs = "2026-01-01T00:01:00.000Z";
    const specFixerTs  = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({
            verdict: "approved",
            startedAt: specFixerTs,
            endedAt: specFixerTs,
          }),
        ],
      },
    });

    // when(state) must return true → routes to test-case-gen (observation pass direct)
    expect(row!.when!(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-009: needs-fix spec-fixer returns to spec-review
// Source: spec.md > Requirement: needs-fix and conformance-triggered spec-fixer shall return
//         to spec-review > Scenario: needs-fix spec-fixer returns to spec-review
// GREEN: unconditional spec-fixer approved → spec-review row exists;
// RED partial: guarded row when predicate must return false for needs-fix context
// ---------------------------------------------------------------------------

describe("TC-009: needs-fix spec-fixer returns to spec-review", () => {
  it("TC-009: STANDARD_TRANSITIONS has unconditional spec-fixer approved → spec-review row", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-009: guarded spec-fixer → test-case-gen when predicate returns false when latest spec-review verdict is needs-fix", () => {
    const guardedRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN,
    );
    // Must exist (RED: doesn't exist yet)
    expect(guardedRow).toBeDefined();
    expect(guardedRow!.when).toBeDefined();

    // State where latest spec-review verdict is "needs-fix" (not observation pass)
    const specReviewTs = "2026-01-01T00:01:00.000Z";
    const specFixerTs  = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({
            verdict: "approved",
            startedAt: specFixerTs,
            endedAt: specFixerTs,
          }),
        ],
      },
    });

    // when(state) must return false → falls through to unconditional spec-fixer approved → spec-review
    expect(guardedRow!.when!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-010: conformance-triggered spec-fixer returns to spec-review
// Source: spec.md > Requirement: needs-fix and conformance-triggered spec-fixer shall return
//         to spec-review > Scenario: conformance-triggered spec-fixer returns to spec-review
// RED: guarded row when predicate must return false for conformance context
// ---------------------------------------------------------------------------

describe("TC-010: conformance-triggered spec-fixer returns to spec-review", () => {
  it("TC-010: guarded spec-fixer → test-case-gen when predicate returns false when conformance needs-fix:spec-fixer is newer than latest spec-review", () => {
    const guardedRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN,
    );
    expect(guardedRow).toBeDefined();
    expect(guardedRow!.when).toBeDefined();

    // State where:
    // - Latest spec-review ran at T1
    // - Conformance ran at T2 > T1 with needs-fix:spec-fixer
    // → getConformanceFixContext(state, SPEC_FIXER) returns non-null
    // → specFixerForwardsToTestGen returns false → routes back to spec-review for reverification
    const specReviewTs  = "2026-01-01T00:01:00.000Z";
    const conformanceTs = "2026-01-01T00:02:00.000Z";
    const specFixerTs   = "2026-01-01T00:03:00.000Z";

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.CONFORMANCE]: [
          makeStepRun({
            verdict: `needs-fix:${STEP_NAMES.SPEC_FIXER}`,
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: conformanceTs,
            endedAt: conformanceTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({
            verdict: "approved",
            startedAt: specFixerTs,
            endedAt: specFixerTs,
          }),
        ],
      },
    });

    // Conformance context is present (newer than spec-review) → must return false
    // → fallback row fires → spec-fixer approved → spec-review (reverification)
    expect(guardedRow!.when!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-011: consumed spec-review fixable finding appears in the regression-gate ledger
// Source: spec.md > Requirement: spec-review fixable findings shall be verified by the
//         regression-gate ledger > Scenario: consumed spec-review fixable finding appears in the ledger
// RED: collectSpecReviewLedger does not exist yet
// ---------------------------------------------------------------------------

describe("TC-011: consumed spec-review fixable finding appears in the regression-gate ledger", () => {
  it("TC-011: collectSpecReviewLedger is exported from findings-ledger.ts", () => {
    expect(collectSpecReviewLedger).toBeDefined();
    expect(typeof collectSpecReviewLedger).toBe("function");
  });

  it("TC-011: collectSpecReviewLedger includes medium fixable on spec.md from spec-review run", () => {
    expect(collectSpecReviewLedger).toBeDefined();
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    const ledger = collectSpecReviewLedger!(state);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.file).toBe(SPEC_MD);
    expect(ledger[0]?.resolution).toBe("fixable");
    expect(ledger[0]?.severity).toBe("medium");
  });

  it("TC-011: collectSpecReviewLedger collects findings from all spec-review runs (multiple iterations)", () => {
    expect(collectSpecReviewLedger).toBeDefined();
    const finding1 = makeFinding("medium", "fixable", SPEC_MD);
    const finding2 = makeFinding("low", "fixable", DESIGN_MD);
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "needs-fix", findings: [finding1], attempt: 1 }),
          makeStepRun({ verdict: "approved", findings: [finding2], attempt: 2 }),
        ],
      },
    });

    const ledger = collectSpecReviewLedger!(state);
    const files = ledger.map((f) => f.file);
    expect(files).toContain(SPEC_MD);
    expect(files).toContain(DESIGN_MD);
  });

  it("TC-011: collectSpecReviewLedger returns empty array when spec-review has no findings", () => {
    expect(collectSpecReviewLedger).toBeDefined();
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved" }), // no findings
        ],
      },
    });

    const ledger = collectSpecReviewLedger!(state);
    expect(ledger).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: regression-gate is not skipped for spec-review-only ledger
// Source: spec.md > Requirement: spec-review fixable findings shall be verified by the
//         regression-gate ledger > Scenario: regression-gate not skipped for spec-review-only ledger
// RED: collectSpecReviewLedger does not exist yet; regression-gate skipWhen does not merge it
// ---------------------------------------------------------------------------

describe("TC-012: regression-gate is not skipped for spec-review-only ledger", () => {
  it("TC-012: collectSpecReviewLedger returns non-empty for spec-review with fixable finding", () => {
    // Prerequisite: collectSpecReviewLedger must exist and return the finding
    expect(collectSpecReviewLedger).toBeDefined();

    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    // When collectSpecReviewLedger returns non-empty, the regression-gate must NOT skip
    const ledger = collectSpecReviewLedger!(state);
    expect(ledger.length).toBeGreaterThan(0);
  });

  it("TC-012: spec-review fixable finding with canonScope included in merged ledger (not excluded for spec.md)", () => {
    expect(collectSpecReviewLedger).toBeDefined();

    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    // With canonScope using specReviewEffectiveFixer (spec-fixer), spec.md is routable
    // → finding is retained in the ledger (not excluded as unroutable)
    const canonScope = makeCanonScope();
    const ledger = collectSpecReviewLedger!(state, canonScope);
    const specMdFinding = ledger.find((f) => f.file === SPEC_MD);
    expect(specMdFinding).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: observation pass runs spec-review exactly once
// Source: spec.md > Requirement: the observation pass shall not consume the spec-review
//         loop budget > Scenario: observation pass runs spec-review once
// RED: STANDARD_TRANSITIONS does not yet have guarded spec-review → spec-fixer row,
//      so pipeline would route spec-review approved → test-case-gen (no spec-fixer call)
//      → spec-fixer count = 0 (not 1) → RED
// ---------------------------------------------------------------------------

describe("TC-013: observation pass runs spec-review exactly once (integration)", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
    void stdoutSpy;
  });

  it("TC-013: spec-review runs exactly once and spec-fixer runs exactly once before test-case-gen", async () => {
    let specReviewCallCount = 0;
    let specFixerCallCount = 0;
    let testCaseGenCallCount = 0;

    const events = new EventBus();
    const specReviewFindings = [makeFinding("medium", "fixable", SPEC_MD)];

    const executeSpy = vi.fn().mockImplementation(
      async (step: Step, state: JobState): Promise<JobState> => {
        const now = new Date().toISOString();

        if (step.name === STEP_NAMES.SPEC_REVIEW) {
          specReviewCallCount++;
          const newRun = makeStepRun({
            verdict: "approved",
            findings: specReviewFindings,
            startedAt: now,
            endedAt: now,
            attempt: specReviewCallCount,
          });
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.SPEC_REVIEW]: [
                ...(state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? []),
                newRun,
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.SPEC_FIXER) {
          specFixerCallCount++;
          const newRun = makeStepRun({
            verdict: "approved",
            startedAt: now,
            endedAt: now,
            attempt: specFixerCallCount,
          });
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.SPEC_FIXER]: [
                ...(state.steps?.[STEP_NAMES.SPEC_FIXER] ?? []),
                newRun,
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.TEST_CASE_GEN) {
          testCaseGenCallCount++;
          const newRun = makeStepRun({
            verdict: "success",
            startedAt: now,
            endedAt: now,
          });
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.TEST_CASE_GEN]: [
                ...(state.steps?.[STEP_NAMES.TEST_CASE_GEN] ?? []),
                newRun,
              ],
            },
          };
        }

        throw new Error(`TC-013: unexpected step ${step.name}`);
      },
    );

    // Use the spec-phase rows from STANDARD_TRANSITIONS + terminal for test-case-gen
    const specPhaseTransitions = [
      ...STANDARD_TRANSITIONS.filter(
        (t) =>
          t.step === STEP_NAMES.SPEC_REVIEW || t.step === STEP_NAMES.SPEC_FIXER,
      ),
      { step: STEP_NAMES.TEST_CASE_GEN, on: "success", to: "end" as const },
      { step: STEP_NAMES.TEST_CASE_GEN, on: "error",   to: "escalate" as const },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.SPEC_REVIEW,   makeStep(STEP_NAMES.SPEC_REVIEW)],
        [STEP_NAMES.SPEC_FIXER,    makeStep(STEP_NAMES.SPEC_FIXER)],
        [STEP_NAMES.TEST_CASE_GEN, makeStep(STEP_NAMES.TEST_CASE_GEN)],
      ]),
      transitions: specPhaseTransitions,
      maxIterations: 3,
      loopName: STEP_NAMES.SPEC_REVIEW,
      loopNames: [STEP_NAMES.SPEC_REVIEW],
      loopFixerPairs: { [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER },
      executor: { execute: executeSpy } as never,
      events,
    });

    const initialState = makeMinimalJobState();
    const deps = {
      slug: TEST_SLUG,
      cwd: "/tmp",
      config: { version: 1, agents: {} } as never,
      request: {
        type: "spec-change",
        title: "TC-013 test",
        slug: TEST_SLUG,
        baseBranch: "main",
        content: "Test",
        adr: false,
        path: REQUEST_MD,
      },
      githubClient: {} as never,
      owner: "octo",
      repo: "repo",
      spawn: vi.fn() as never,
      storeFactory: (() => ({})) as never,
      runner: {} as never,
    } as never;

    const finalState = await pipeline.run(STEP_NAMES.SPEC_REVIEW, initialState, deps);

    // TC-013 assertions:
    // 1. spec-review ran exactly once (observation pass uses no extra budget)
    expect(specReviewCallCount).toBe(1);
    // 2. spec-fixer ran exactly once (observation pass consumed fixable findings)
    expect(specFixerCallCount).toBe(1);
    // 3. test-case-gen was reached (pipeline completed spec phase)
    expect(testCaseGenCallCount).toBe(1);
    // 4. pipeline completed successfully (not loop-exhausted)
    expect(finalState.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-014: code-review verdict derivation is unchanged
// Source: spec.md > Requirement: impl-side observation auto-fix and other verdict derivations
//         shall be unchanged > Scenario: code-review verdict derivation unchanged
// GREEN: deriveJudgeVerdict is unchanged
// ---------------------------------------------------------------------------

describe("TC-014: code-review verdict derivation is unchanged", () => {
  it("TC-014: deriveJudgeVerdict(medium fixable on non-canon) === 'approved' (unchanged)", () => {
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("approved");
  });

  it("TC-014: deriveJudgeVerdict(critical fixable) === 'needs-fix' (unchanged)", () => {
    const findings = [makeFinding("critical", "fixable", "src/example.ts")];
    const verdict = deriveJudgeVerdict(findings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-014: deriveJudgeVerdict(ok:false) === 'escalation' (unchanged)", () => {
    const verdict = deriveJudgeVerdict([], false);
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-015: FAST transitions contain no spec-review / spec-fixer / test-case-gen rows
// Source: spec.md > Requirement: impl-side observation auto-fix and other verdict derivations
//         shall be unchanged > Scenario: FAST transitions unchanged
// GREEN: FAST_TRANSITIONS does not include spec-review / spec-fixer / test-case-gen
// ---------------------------------------------------------------------------

describe("TC-015: FAST transitions contain no spec-review / spec-fixer / test-case-gen rows", () => {
  it("TC-015: FAST_TRANSITIONS has no spec-review rows", () => {
    const row = FAST_TRANSITIONS.find((t) => t.step === STEP_NAMES.SPEC_REVIEW);
    expect(row).toBeUndefined();
  });

  it("TC-015: FAST_TRANSITIONS has no spec-fixer rows", () => {
    const row = FAST_TRANSITIONS.find((t) => t.step === STEP_NAMES.SPEC_FIXER);
    expect(row).toBeUndefined();
  });

  it("TC-015: FAST_TRANSITIONS has no test-case-gen rows", () => {
    const row = FAST_TRANSITIONS.find((t) => t.step === STEP_NAMES.TEST_CASE_GEN);
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-016: medium fixable on tasks.md approves
// Source: tasks.md > T-01 Acceptance Criteria
// RED: current deriveSpecReviewVerdict returns "needs-fix" for routable canon fixable (severity-independent)
// ---------------------------------------------------------------------------

describe("TC-016: medium fixable on tasks.md approves", () => {
  it("TC-016: deriveSpecReviewVerdict(medium fixable on tasks.md) === 'approved'", () => {
    const findings = [
      makeFinding("medium", "fixable", TASKS_MD),
    ];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-017: non-canon medium fixable on implementation file approves
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: non-canon files do not trigger canon escalation; medium is not critical/high → approved
// ---------------------------------------------------------------------------

describe("TC-017: non-canon medium fixable on implementation file approves", () => {
  it("TC-017: deriveSpecReviewVerdict(medium fixable on src/example.ts) === 'approved'", () => {
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-018: non-canon critical or high fixable remains needs-fix
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: judgment 5 (non-canon critical/high → needs-fix) is unchanged
// ---------------------------------------------------------------------------

describe("TC-018: non-canon critical or high fixable remains needs-fix", () => {
  it("TC-018: deriveSpecReviewVerdict(critical fixable on src/example.ts) === 'needs-fix'", () => {
    const findings = [makeFinding("critical", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });

  it("TC-018: deriveSpecReviewVerdict(high fixable on src/example.ts) === 'needs-fix'", () => {
    const findings = [makeFinding("high", "fixable", "src/example.ts")];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-019: decision-needed finding escalates
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: judgment 3 (decision-needed → escalation) is unchanged
// ---------------------------------------------------------------------------

describe("TC-019: decision-needed finding escalates", () => {
  it("TC-019: deriveSpecReviewVerdict(decision-needed finding) === 'escalation'", () => {
    const findings = [
      {
        severity: "low" as const,
        resolution: "decision-needed" as const,
        file: "src/example.ts",
        title: "needs a decision",
        rationale: "rationale",
      },
    ];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-019: decision-needed on canon file also escalates (unchanged)", () => {
    const findings = [
      {
        severity: "low" as const,
        resolution: "decision-needed" as const,
        file: SPEC_MD,
        title: "spec decision needed",
        rationale: "rationale",
      },
    ];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-020: ok:false escalates
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: judgment 1 (ok:false → escalation) is unchanged
// ---------------------------------------------------------------------------

describe("TC-020: ok:false escalates", () => {
  it("TC-020: deriveSpecReviewVerdict(ok:false, no findings) === 'escalation'", () => {
    const verdict = deriveSpecReviewVerdict([], false, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-020: deriveSpecReviewVerdict(ok:false, fixable findings on spec.md) === 'escalation' (ok:false takes priority)", () => {
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, false, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-021: vacuous check (evidence.checked = 0) escalates
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: judgment 2 (vacuous → escalation) is unchanged
// ---------------------------------------------------------------------------

describe("TC-021: vacuous check (evidence.checked = 0) escalates", () => {
  it("TC-021: deriveSpecReviewVerdict(checked=0, no findings) === 'escalation'", () => {
    const evidence: Evidence = { checked: 0, skipped: 3, unverified: 0 };
    const verdict = deriveSpecReviewVerdict([], true, evidence, makeCanonScope());
    expect(verdict).toBe("escalation");
  });

  it("TC-021: deriveSpecReviewVerdict(checked=0, spec.md fixable) === 'escalation' (vacuous takes priority)", () => {
    const evidence: Evidence = { checked: 0, skipped: 0, unverified: 0 };
    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, evidence, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-022: unroutable and routable findings coexist — unroutable escalation wins (4a priority)
// Source: tasks.md > T-01 Acceptance Criteria
// GREEN: 4a (unroutable canon fixable → escalation) fires before 4b (routable → needs-fix/approved)
// ---------------------------------------------------------------------------

describe("TC-022: unroutable and routable findings coexist — unroutable escalation wins (4a priority)", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    void stderrSpy;
  });

  it("TC-022: request.md (unroutable) + spec.md (routable) both medium fixable → escalation wins", () => {
    const findings = [
      makeFinding("medium", "fixable", REQUEST_MD), // unroutable
      makeFinding("medium", "fixable", SPEC_MD),    // routable
    ];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-023: buildCanonWriteScopeFromState returns same scope as buildCanonWriteScope
// Source: tasks.md > T-02 Acceptance Criteria
// RED: buildCanonWriteScopeFromState does not exist yet
// ---------------------------------------------------------------------------

describe("TC-023: buildCanonWriteScopeFromState returns same scope as buildCanonWriteScope", () => {
  it("TC-023: buildCanonWriteScopeFromState is exported from canon-write-scope.ts", () => {
    expect(buildCanonWriteScopeFromState).toBeDefined();
    expect(typeof buildCanonWriteScopeFromState).toBe("function");
  });

  it("TC-023: buildCanonWriteScopeFromState(state) has same canonPaths as buildCanonWriteScope(state, deps)", () => {
    expect(buildCanonWriteScopeFromState).toBeDefined();

    const state = makeMinimalJobState();
    const deps = {
      slug: TEST_SLUG,
      config: { version: 1, agents: {} } as never,
      request: {
        type: "spec-change" as const,
        title: "test",
        slug: TEST_SLUG,
        baseBranch: "main",
        content: "test",
        adr: false,
        path: REQUEST_MD,
      },
    } as never;

    const scopeFromState = buildCanonWriteScopeFromState!(state);
    const scopeFromDeps  = buildCanonWriteScope(state, deps);

    // Both must return the same canonPaths set
    expect([...scopeFromState.canonPaths].sort()).toEqual([...scopeFromDeps.canonPaths].sort());
  });

  it("TC-023: buildCanonWriteScopeFromState(state).writableByFixer matches buildCanonWriteScope writableByFixer", () => {
    expect(buildCanonWriteScopeFromState).toBeDefined();

    const state = makeMinimalJobState();
    const deps = {
      slug: TEST_SLUG,
      config: { version: 1, agents: {} } as never,
      request: {
        type: "spec-change" as const,
        title: "test",
        slug: TEST_SLUG,
        baseBranch: "main",
        content: "test",
        adr: false,
        path: REQUEST_MD,
      },
    } as never;

    const scopeFromState = buildCanonWriteScopeFromState!(state);
    const scopeFromDeps  = buildCanonWriteScope(state, deps);

    const fixers: FixTarget[] = ["code-fixer", "implementer", "spec-fixer"];
    for (const fixer of fixers) {
      const fromState = [...(scopeFromState.writableByFixer.get(fixer) ?? new Set())].sort();
      const fromDeps  = [...(scopeFromDeps.writableByFixer.get(fixer) ?? new Set())].sort();
      expect(fromState).toEqual(fromDeps);
    }
  });

  it("TC-023: getJobSlug(state) === TEST_SLUG (prerequisite for buildCanonWriteScopeFromState)", () => {
    // Verify that getJobSlug correctly derives the slug from the test state
    const state = makeMinimalJobState();
    expect(getJobSlug(state)).toBe(TEST_SLUG);
  });
});

// ---------------------------------------------------------------------------
// TC-024: specReviewHasRoutableFixables is false when only non-canon fixable finding present
// Source: tasks.md > T-03 Acceptance Criteria
// RED: spec-observation.ts does not exist yet
// ---------------------------------------------------------------------------

describe("TC-024: specReviewHasRoutableFixables is false when only non-canon fixable finding present", () => {
  it("TC-024: specReviewHasRoutableFixables returns false for only non-canon fixable finding", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specReviewHasRoutableFixables = specObs?.specReviewHasRoutableFixables as
      | ((state: JobState) => boolean)
      | undefined;

    // RED: function is undefined when module does not exist
    expect(specReviewHasRoutableFixables).toBeDefined();

    // State with only non-canon fixable (src/example.ts is not in spec-fixer writable paths)
    const findings = [makeFinding("medium", "fixable", "src/example.ts")];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    expect(specReviewHasRoutableFixables!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-025: specReviewHasRoutableFixables is false when no spec-review runs exist
// Source: tasks.md > T-03 Acceptance Criteria
// RED: spec-observation.ts does not exist yet
// ---------------------------------------------------------------------------

describe("TC-025: specReviewHasRoutableFixables is false when no spec-review runs exist", () => {
  it("TC-025: specReviewHasRoutableFixables returns false for state with no spec-review runs", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specReviewHasRoutableFixables = specObs?.specReviewHasRoutableFixables as
      | ((state: JobState) => boolean)
      | undefined;

    expect(specReviewHasRoutableFixables).toBeDefined();

    const state = makeMinimalJobState(); // no steps
    expect(specReviewHasRoutableFixables!(state)).toBe(false);
  });

  it("TC-025: specReviewHasRoutableFixables returns true for state with routable fixable on spec.md", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specReviewHasRoutableFixables = specObs?.specReviewHasRoutableFixables as
      | ((state: JobState) => boolean)
      | undefined;

    expect(specReviewHasRoutableFixables).toBeDefined();

    const findings = [makeFinding("medium", "fixable", SPEC_MD)];
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings }),
        ],
      },
    });

    expect(specReviewHasRoutableFixables!(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-026: specFixerForwardsToTestGen is false when no spec-review runs exist
// Source: tasks.md > T-03 Acceptance Criteria
// RED: spec-observation.ts does not exist yet
// ---------------------------------------------------------------------------

describe("TC-026: specFixerForwardsToTestGen is false when no spec-review runs exist", () => {
  it("TC-026: specFixerForwardsToTestGen returns false when no spec-review runs exist", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specFixerForwardsToTestGen = specObs?.specFixerForwardsToTestGen as
      | ((state: JobState) => boolean)
      | undefined;

    expect(specFixerForwardsToTestGen).toBeDefined();

    const state = makeMinimalJobState(); // no steps
    expect(specFixerForwardsToTestGen!(state)).toBe(false);
  });

  it("TC-026: specFixerForwardsToTestGen returns true when spec-review approved and no conformance context", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specFixerForwardsToTestGen = specObs?.specFixerForwardsToTestGen as
      | ((state: JobState) => boolean)
      | undefined;

    expect(specFixerForwardsToTestGen).toBeDefined();

    // Observation pass: spec-review approved, no conformance
    const specReviewTs = "2026-01-01T00:01:00.000Z";
    const specFixerTs  = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: specFixerTs, endedAt: specFixerTs }),
        ],
      },
    });

    expect(specFixerForwardsToTestGen!(state)).toBe(true);
  });

  it("TC-026: specFixerForwardsToTestGen returns false when latest spec-review verdict is needs-fix", async () => {
    let specObs: Record<string, unknown> | null = null;
    try {
      specObs = await import("../../../../src/core/pipeline/spec-observation.js") as Record<string, unknown>;
    } catch {
      // Module does not exist yet → RED
    }

    const specFixerForwardsToTestGen = specObs?.specFixerForwardsToTestGen as
      | ((state: JobState) => boolean)
      | undefined;

    expect(specFixerForwardsToTestGen).toBeDefined();

    // needs-fix path: spec-review returned needs-fix
    const specReviewTs = "2026-01-01T00:01:00.000Z";
    const specFixerTs  = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: specFixerTs, endedAt: specFixerTs }),
        ],
      },
    });

    expect(specFixerForwardsToTestGen!(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-027: high fixable verdict path — full needs-fix loop (spec-review → spec-fixer → spec-review)
// Source: tasks.md > T-06 (遷移テスト — needs-fix 往復不変)
// RED partial: guarded spec-fixer → test-case-gen when predicate must return false for this path
// ---------------------------------------------------------------------------

describe("TC-027: high fixable verdict path — full needs-fix loop (spec-review → spec-fixer → spec-review)", () => {
  it("TC-027: high fixable on spec.md causes spec-review verdict to be needs-fix", () => {
    const findings = [makeFinding("high", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });

  it("TC-027: critical fixable on spec.md causes spec-review verdict to be needs-fix", () => {
    const findings = [makeFinding("critical", "fixable", SPEC_MD)];
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, makeCanonScope());
    expect(verdict).toBe("needs-fix");
  });

  it("TC-027: STANDARD_TRANSITIONS has spec-review needs-fix → spec-fixer (unconditional)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "needs-fix" &&
        t.to === STEP_NAMES.SPEC_FIXER,
    );
    expect(row).toBeDefined();
  });

  it("TC-027: for needs-fix context, spec-fixer approved → spec-review (NOT test-case-gen)", () => {
    // The guarded row spec-fixer approved → test-case-gen must have when returning false
    // The unconditional spec-fixer approved → spec-review must exist and fire
    const guardedRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN,
    );
    // RED: guarded row doesn't exist yet
    expect(guardedRow).toBeDefined();
    expect(guardedRow!.when).toBeDefined();

    // State: spec-review verdict was needs-fix (high fixable)
    const specReviewTs = "2026-01-01T00:01:00.000Z";
    const specFixerTs  = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: specReviewTs,
            endedAt: specReviewTs,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: specFixerTs, endedAt: specFixerTs }),
        ],
      },
    });

    // when returns false → guarded row does NOT fire → unconditional spec-fixer → spec-review fires
    expect(guardedRow!.when!(state)).toBe(false);
  });

  it("TC-027: unconditional spec-fixer approved → spec-review row exists (fallback for needs-fix path)", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !t.when,
    );
    expect(row).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-028: request.md spec-review fixable finding is excluded from ledger with canonScope
// Source: tasks.md > T-05 Acceptance Criteria
// RED: collectSpecReviewLedger does not exist yet
// ---------------------------------------------------------------------------

describe("TC-028: request.md spec-review fixable finding is excluded from ledger with canonScope", () => {
  it("TC-028: collectSpecReviewLedger with canonScope excludes request.md finding", () => {
    expect(collectSpecReviewLedger).toBeDefined();

    const requestFinding = makeFinding("medium", "fixable", REQUEST_MD);
    const specFinding    = makeFinding("medium", "fixable", SPEC_MD);

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [requestFinding, specFinding],
          }),
        ],
      },
    });

    // With canonScope using specReviewEffectiveFixer:
    // - request.md is unroutable (spec-fixer cannot write it) → excluded
    // - spec.md is routable (spec-fixer can write it) → retained
    const canonScope = makeCanonScope();
    const ledger = collectSpecReviewLedger!(state, canonScope);

    const files = ledger.map((f) => f.file);
    expect(files).not.toContain(REQUEST_MD);
    expect(files).toContain(SPEC_MD);
  });

  it("TC-028: collectSpecReviewLedger without canonScope includes request.md finding (no exclusion)", () => {
    expect(collectSpecReviewLedger).toBeDefined();

    const requestFinding = makeFinding("medium", "fixable", REQUEST_MD);
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", findings: [requestFinding] }),
        ],
      },
    });

    // Without canonScope: no exclusion applied
    const ledger = collectSpecReviewLedger!(state);
    expect(ledger.map((f) => f.file)).toContain(REQUEST_MD);
  });

  it("TC-028: collectSpecReviewLedger with canonScope retains spec.md, design.md, tasks.md findings", () => {
    expect(collectSpecReviewLedger).toBeDefined();

    const specFinding   = makeFinding("medium", "fixable", SPEC_MD);
    const designFinding = makeFinding("low",    "fixable", DESIGN_MD);
    const tasksFinding  = makeFinding("medium", "fixable", TASKS_MD);

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [specFinding, designFinding, tasksFinding],
          }),
        ],
      },
    });

    const canonScope = makeCanonScope();
    const ledger = collectSpecReviewLedger!(state, canonScope);

    const files = ledger.map((f) => f.file);
    expect(files).toContain(SPEC_MD);
    expect(files).toContain(DESIGN_MD);
    expect(files).toContain(TASKS_MD);
  });
});

// ---------------------------------------------------------------------------
// TC-029: STANDARD_TRANSITIONS length is 46 after adding two guarded rows
// Source: tasks.md > T-07 (TC-030 in pipeline.transitions.test.ts); design.md > D4
// RED: currently 44 rows (guarded rows not yet added)
// ---------------------------------------------------------------------------

describe("TC-029: STANDARD_TRANSITIONS length is 46 after adding two guarded rows", () => {
  it("TC-029: STANDARD_TRANSITIONS.length === 46 (+2 guarded rows for spec observation auto-fix)", () => {
    // Previously 44 rows (+2 for the two new guarded rows):
    // 1. spec-review approved → spec-fixer when specReviewHasRoutableFixables
    // 2. spec-fixer approved → test-case-gen when specFixerForwardsToTestGen
    expect(STANDARD_TRANSITIONS.length).toBe(46);
  });

  it("TC-029: the two new guarded rows are distinct from the existing unconditional rows", () => {
    // New guarded row 1: spec-review approved → spec-fixer (with when)
    const guardedSpecReviewRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER &&
        !!t.when,
    );
    expect(guardedSpecReviewRow).toBeDefined();

    // New guarded row 2: spec-fixer approved → test-case-gen (with when)
    const guardedSpecFixerRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(guardedSpecFixerRow).toBeDefined();

    // Existing unconditional rows still present
    const unconditionalSpecReviewRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !t.when,
    );
    expect(unconditionalSpecReviewRow).toBeDefined();

    const unconditionalSpecFixerRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !t.when,
    );
    expect(unconditionalSpecFixerRow).toBeDefined();
  });
});
