/**
 * Tests for test-case-gen を design phase の最終工程へ移動
 *
 * Source: specrunner/changes/test-case-gen-design-phase/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * TC-001: 通常 type は design から test-case-gen へ進む
 * TC-002: 通常 type は test-case-gen から spec-review へ進む
 * TC-003: 通常 type は spec-review 承認後に test-materialize へ進む
 * TC-004: 免除 type は design から spec-review へ直行する
 * TC-005: 免除 type は test-case-gen を通らない（integration）
 * TC-006: spec-fixer 修正後は test-case-gen を再生成する
 * TC-007: 再生成後に spec-review へ戻る
 * TC-008: TC のみの needs-fix は test-case-gen へ直行する
 * TC-010: 観察 pass の spec-fixer は test-materialize へ継続する
 * TC-011: 観察 pass 後に spec-review は再実行されない（integration）
 * TC-012: 通常 type の spec-review 入力に test-cases.md が含まれる
 * TC-014: spec-review prompt に TC 照合観点が含まれる
 * TC-015: test-case-gen prompt に振る舞いレベル指示が含まれる
 * TC-016: test-case-gen の write 宣言は test-cases.md のみ
 * TC-017: spec-review の test-cases.md fixable finding は needs-fix になる
 * TC-018: 再生成時に TC finding が test-case-gen へ渡される
 * TC-019: 承認後の test-cases.md finding は operator 保護される
 * TC-021: specFixerObservationForward が観察 pass 検出を正しく担う (should)
 * TC-022: specFixerNeedsFixForward が needs-fix/conformance-triggered で正しく真偽を返す (should)
 * TC-026: 組み替え後の STANDARD_TRANSITIONS の行数は 52 (should)
 * TC-028: TC と severity 問わず spec routable finding の混在では specReviewNeedsFixIsTcOnly が false (must)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Finding, FixTarget } from "../../../../src/kernel/report-result.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { CanonWriteScope } from "../../../../src/core/step/canon-escalation.js";
import type { StepDeps } from "../../../../src/core/step/types.js";
import { STANDARD_TRANSITIONS } from "../../../../src/core/pipeline/types.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import {
  deriveSpecReviewVerdict,
  deriveConformanceVerdict,
  deriveJudgeVerdict,
} from "../../../../src/core/step/judge-verdict.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../../../../src/prompts/spec-review-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../../../src/prompts/test-case-gen-system.js";
import { SpecReviewStep } from "../../../../src/core/step/spec-review.js";
import { TestCaseGenStep } from "../../../../src/core/step/test-case-gen.js";
import { changeFolderPath } from "../../../../src/util/paths.js";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { Step } from "../../../../src/core/step/types.js";

// Namespace import for new exports from spec-observation.ts (RED until T-03 implements them)
import * as specObsNS from "../../../../src/core/pipeline/spec-observation.js";

// ---------------------------------------------------------------------------
// Type declarations for new guard exports (undefined in RED phase)
// ---------------------------------------------------------------------------

type GuardFn = (state: JobState) => boolean;

/** specFixerObservationForward — renamed from specFixerForwardsToTestGen in T-03 */
const specFixerObservationForward = (specObsNS as Record<string, unknown>)
  .specFixerObservationForward as GuardFn | undefined;

/** specFixerNeedsFixForward — new guard added in T-03 */
const specFixerNeedsFixForward = (specObsNS as Record<string, unknown>)
  .specFixerNeedsFixForward as GuardFn | undefined;

/** specReviewNeedsFixIsTcOnly — new guard added in T-03 */
const specReviewNeedsFixIsTcOnly = (specObsNS as Record<string, unknown>)
  .specReviewNeedsFixIsTcOnly as GuardFn | undefined;

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

function makeFinding(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
  file: string,
  title?: string,
): Finding {
  return {
    severity,
    resolution,
    file,
    title: title ?? `test finding on ${file.split("/").pop()}`,
    rationale: `test rationale for ${file.split("/").pop()}`,
  };
}

function makeMinimalJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "tcgdp-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: REQUEST_MD,
      title: "Test-case-gen Design Phase Test",
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

/**
 * Canon write scope WITH test-case-gen writable for test-cases.md.
 * Used for TC-017: spec-review verdict derivation after T-01/T-02 implementation.
 * "test-case-gen" cast required until T-01 adds it to FixTarget union.
 */
function makeCanonScopeWithTcGen(): CanonWriteScope {
  const canonPaths = new Set([
    REQUEST_MD, SPEC_MD, DESIGN_MD, TASKS_MD, TEST_CASES_MD, ATTESTATION_PATH,
  ]);
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    ["code-fixer", new Set<string>()],
    ["implementer", new Set<string>([TASKS_MD])],
    ["spec-fixer", new Set<string>([SPEC_MD, DESIGN_MD, TASKS_MD])],
    // test-case-gen added in T-01 — cast required in RED phase
    ["test-case-gen" as FixTarget, new Set<string>([TEST_CASES_MD])],
  ]);
  return { canonPaths, writableByFixer };
}

/**
 * Canon write scope WITHOUT test-case-gen fixer entry.
 * Used for post-approval phase tests (TC-019: conformance / judge still escalate).
 */
function makeCanonScopeWithoutTcGen(): CanonWriteScope {
  const canonPaths = new Set([
    REQUEST_MD, SPEC_MD, DESIGN_MD, TASKS_MD, TEST_CASES_MD, ATTESTATION_PATH,
  ]);
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    ["code-fixer", new Set<string>()],
    ["implementer", new Set<string>([TASKS_MD])],
    ["spec-fixer", new Set<string>([SPEC_MD, DESIGN_MD, TASKS_MD])],
  ]);
  return { canonPaths, writableByFixer };
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

function makeMinimalDeps(slug: string = TEST_SLUG, type: string = "spec-change"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
    },
    request: {
      type,
      title: "Test",
      slug,
      baseBranch: "main",
      content: "Test content for test-case-gen design phase",
      adr: false,
    },
    slug,
  };
}

// Helper for integration test deps
function makeIntegrationDeps(slug: string, type: string) {
  return {
    slug,
    config: { version: 1, agents: {} } as never,
    request: { type, title: "Test", slug, baseBranch: "main", content: "Test", adr: false },
    githubClient: {} as never,
    owner: "octo",
    repo: "repo",
    spawn: vi.fn() as never,
    storeFactory: (() => ({
      persist: async () => undefined,
      fail: async (s: JobState) => s,
      update: async (s: JobState, p: Partial<JobState>) => ({ ...s, ...p }),
      appendHistory: async (s: JobState) => s,
      appendInterruption: async () => undefined,
      appendLineage: async () => undefined,
    })) as never,
  } as never;
}

// ---------------------------------------------------------------------------
// TC-001: 通常 type は design から test-case-gen へ進む
// Source: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する
//         > Scenario: 通常 type は design から test-case-gen へ進む
// RED: currently DESIGN success → SPEC_REVIEW (unconditional), not TEST_CASE_GEN
// ---------------------------------------------------------------------------

describe("TC-001: 通常 type は design から test-case-gen へ進む", () => {
  it("TC-001: STANDARD_TRANSITIONS に design --success→ test-case-gen (unconditional) が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-001: design --success→ spec-review の unconditional (when なし) row は存在しない（旧遷移削除）", () => {
    // After reorganization: design → spec-review is guarded by isTestGenExempt
    const unconditional = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !t.when,
    );
    expect(unconditional).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-002: 通常 type は test-case-gen から spec-review へ進む
// Source: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する
//         > Scenario: 通常 type は test-case-gen から spec-review へ進む
// RED: currently TEST_CASE_GEN success → TEST_MATERIALIZE
// ---------------------------------------------------------------------------

describe("TC-002: 通常 type は test-case-gen から spec-review へ進む", () => {
  it("TC-002: STANDARD_TRANSITIONS に test-case-gen --success→ spec-review が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.TEST_CASE_GEN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW,
    );
    expect(row).toBeDefined();
  });

  it("TC-002: test-case-gen --success→ test-materialize は存在しない（旧遷移が削除されている）", () => {
    const old = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.TEST_CASE_GEN &&
        t.on === "success" &&
        t.to === STEP_NAMES.TEST_MATERIALIZE,
    );
    expect(old).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-003: 通常 type は spec-review 承認後に test-materialize へ進む
// Source: spec.md > Requirement: 通常 type は test-case-gen を spec-review の前に実行する
//         > Scenario: 通常 type は spec-review 承認後に test-materialize へ進む
// RED: currently unconditional spec-review approved → test-case-gen
// ---------------------------------------------------------------------------

describe("TC-003: 通常 type は spec-review 承認後に test-materialize へ進む", () => {
  it("TC-003: STANDARD_TRANSITIONS に spec-review --approved→ test-materialize (unconditional) が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_MATERIALIZE &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-003: spec-review --approved→ test-case-gen の unconditional row は存在しない（旧遷移削除）", () => {
    const old = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !t.when,
    );
    expect(old).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-004: 免除 type は design から spec-review へ直行する
// Source: spec.md > Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する
//         > Scenario: 免除 type は design から spec-review へ直行する
// RED: currently no guarded design → spec-review row (design always → spec-review unconditional)
// ---------------------------------------------------------------------------

describe("TC-004: 免除 type は design から spec-review へ直行する", () => {
  it("TC-004: STANDARD_TRANSITIONS に design --success→ spec-review の guarded row (isTestGenExempt) が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !!t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-004: guarded design → spec-review の when predicate は chore type で true を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    const state = makeMinimalJobState({
      request: { path: REQUEST_MD, title: "Chore", type: "chore", slug: TEST_SLUG },
    });
    expect(row.when(state)).toBe(true);
  });

  it("TC-004: guarded design → spec-review の when predicate は spec-change type で false を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    const state = makeMinimalJobState({
      request: { path: REQUEST_MD, title: "Spec Change", type: "spec-change", slug: TEST_SLUG },
    });
    expect(row.when(state)).toBe(false);
  });

  it("TC-004: guarded design → spec-review row は unconditional test-case-gen row より前（first-match-wins）", () => {
    const guardedIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        !!t.when,
    );
    const unconditionalIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !t.when,
    );
    expect(guardedIdx).toBeGreaterThanOrEqual(0);
    expect(unconditionalIdx).toBeGreaterThanOrEqual(0);
    expect(guardedIdx).toBeLessThan(unconditionalIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-005: 免除 type は test-case-gen を通らない（integration）
// Source: spec.md > Requirement: 免除 type は test-case-gen を通らず design から spec-review へ直行する
//         > Scenario: 免除 type は test-case-gen を通らない
// ---------------------------------------------------------------------------

describe("TC-005: 免除 type は test-case-gen を通らない（integration）", () => {
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

  it("TC-005: chore type の pipeline で test-case-gen step は呼ばれない", async () => {
    let testCaseGenCallCount = 0;
    let specReviewCallCount = 0;
    let designCallCount = 0;

    const events = new EventBus();

    const executeSpy = vi.fn().mockImplementation(
      async (step: Step, state: JobState): Promise<JobState> => {
        const now = new Date().toISOString();

        if (step.name === STEP_NAMES.DESIGN) {
          designCallCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.DESIGN]: [
                ...(state.steps?.[STEP_NAMES.DESIGN] ?? []),
                makeStepRun({ verdict: "success", startedAt: now, endedAt: now }),
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.SPEC_REVIEW) {
          specReviewCallCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.SPEC_REVIEW]: [
                ...(state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? []),
                makeStepRun({ verdict: "approved", startedAt: now, endedAt: now }),
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.TEST_CASE_GEN) {
          testCaseGenCallCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.TEST_CASE_GEN]: [
                ...(state.steps?.[STEP_NAMES.TEST_CASE_GEN] ?? []),
                makeStepRun({ verdict: "success", startedAt: now, endedAt: now }),
              ],
            },
          };
        }

        // Terminal: implementer, test-materialize
        return { ...state };
      },
    );

    // Build spec-phase subset of transitions
    const specPhaseTransitions = [
      ...STANDARD_TRANSITIONS.filter(
        (t) =>
          t.step === STEP_NAMES.DESIGN ||
          t.step === STEP_NAMES.SPEC_REVIEW ||
          t.step === STEP_NAMES.TEST_CASE_GEN,
      ),
      { step: STEP_NAMES.IMPLEMENTER, on: "success", to: "end" as const },
      { step: STEP_NAMES.IMPLEMENTER, on: "error", to: "escalate" as const },
      { step: STEP_NAMES.TEST_MATERIALIZE, on: "success", to: "end" as const },
      { step: STEP_NAMES.TEST_MATERIALIZE, on: "error", to: "escalate" as const },
    ];

    const allStepNames = [
      ...new Set(
        specPhaseTransitions
          .flatMap((t) => [t.step, t.to])
          .filter((n) => n !== "end" && n !== "escalate"),
      ),
    ];
    const stepsMap = new Map(allStepNames.map((name) => [name, makeStep(name)]));

    const pipeline = new Pipeline({
      steps: stepsMap,
      transitions: specPhaseTransitions,
      maxIterations: 3,
      loopName: STEP_NAMES.SPEC_REVIEW,
      loopNames: [STEP_NAMES.SPEC_REVIEW],
      executor: { execute: executeSpy } as never,
      events,
    });

    // Exempt type: chore
    const initialState = makeMinimalJobState({
      request: { path: REQUEST_MD, title: "Chore Task", type: "chore", slug: TEST_SLUG },
      step: STEP_NAMES.DESIGN,
    });

    await pipeline.run(
      STEP_NAMES.DESIGN,
      initialState,
      makeIntegrationDeps(TEST_SLUG, "chore"),
    );

    // TC-005: test-case-gen was never called for exempt type
    expect(testCaseGenCallCount).toBe(0);
    // design ran once
    expect(designCallCount).toBe(1);
    // spec-review ran once (directly from design)
    expect(specReviewCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-006: spec-fixer 修正後は test-case-gen を再生成する
// Source: spec.md > Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする
//         > Scenario: spec-fixer 修正後は test-case-gen を再生成する
// RED: when predicate behavior — currently specFixerForwardsToTestGen (observation pass only)
//      must change to specFixerNeedsFixForward (needs-fix path)
// ---------------------------------------------------------------------------

describe("TC-006: spec-fixer 修正後は test-case-gen を再生成する", () => {
  it("TC-006: STANDARD_TRANSITIONS に spec-fixer --approved→ test-case-gen の guarded row が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-006: spec-fixer → test-case-gen の when predicate は needs-fix spec-review 状態で true を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    // State where latest spec-review verdict was needs-fix (needs-fix path, not observation pass)
    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });

    // needs-fix path → when returns true (specFixerNeedsFixForward)
    expect(row.when(state)).toBe(true);
  });

  it("TC-006: spec-fixer → test-case-gen の when predicate は observation pass 状態で false を返す（区別）", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    // Observation pass state: spec-review verdict was approved (not needs-fix)
    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });

    // Observation pass → specFixerNeedsFixForward returns false (it's not a needs-fix path)
    expect(row.when(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-007: 再生成後に spec-review へ戻る
// Source: spec.md > Requirement: needs-fix 後は test-case-gen を常時再生成してから再レビューする
//         > Scenario: 再生成後に spec-review へ戻る
// Covered by TC-002: TEST_CASE_GEN success → SPEC_REVIEW
// ---------------------------------------------------------------------------

describe("TC-007: 再生成後に spec-review へ戻る", () => {
  it("TC-007: STANDARD_TRANSITIONS に test-case-gen --success→ spec-review が存在する（TC-002 と同一エッジの確認）", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.TEST_CASE_GEN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW,
    );
    expect(row).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: TC のみの needs-fix は test-case-gen へ直行する
// Source: spec.md > Requirement: TC のみの needs-fix は spec-fixer を経由せず test-case-gen を再生成する
//         > Scenario: TC のみの needs-fix は test-case-gen へ直行する
// RED: specReviewNeedsFixIsTcOnly not implemented; transition row doesn't exist
// ---------------------------------------------------------------------------

describe("TC-008: TC のみの needs-fix は test-case-gen へ直行する", () => {
  it("TC-008: STANDARD_TRANSITIONS に spec-review --needs-fix→ test-case-gen の guarded row が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "needs-fix" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-008: spec-review needs-fix → test-case-gen の when predicate は TC-only finding 状態で true を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "needs-fix" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    // TC-only: only test-cases.md finding, no spec/design/tasks findings
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", TEST_CASES_MD)],
          }),
        ],
      },
    });

    expect(row.when(state)).toBe(true);
  });

  it("TC-008: spec-review needs-fix → test-case-gen の when predicate は spec finding 混在状態で false を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "needs-fix" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    // Mixed: TC finding + spec finding → spec-fixer needed
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [
              makeFinding("high", "fixable", TEST_CASES_MD),
              makeFinding("high", "fixable", SPEC_MD),
            ],
          }),
        ],
      },
    });

    expect(row.when(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-010: 観察 pass の spec-fixer は test-materialize へ継続する
// Source: spec.md > Requirement: 観察 pass の意味論を維持する
//         > Scenario: 観察 pass の spec-fixer は test-materialize へ継続する
// RED: currently spec-fixer approved → test-case-gen (old), not test-materialize
// ---------------------------------------------------------------------------

describe("TC-010: 観察 pass の spec-fixer は test-materialize へ継続する", () => {
  it("TC-010: STANDARD_TRANSITIONS に spec-fixer --approved→ test-materialize の guarded row が存在する", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_MATERIALIZE &&
        !!t.when,
    );
    expect(row).toBeDefined();
  });

  it("TC-010: spec-fixer → test-materialize の when predicate は observation pass 状態で true を返す", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_MATERIALIZE &&
        !!t.when,
    );
    expect(row).toBeDefined();
    if (!row?.when) return;

    // Observation pass: spec-review approved, no conformance context
    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });

    expect(row.when(state)).toBe(true);
  });

  it("TC-010: spec-fixer → test-case-gen の guarded when predicate は observation pass 状態で false（needs-fix 専用）", () => {
    // The specFixerNeedsFixForward guard on spec-fixer → test-case-gen must return false for observation pass
    const tcgRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_FIXER &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        !!t.when,
    );
    expect(tcgRow).toBeDefined();
    if (!tcgRow?.when) return;

    // Observation pass state
    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });

    // specFixerNeedsFixForward returns false for observation pass
    expect(tcgRow.when(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-011: 観察 pass 後に spec-review は再実行されない（integration）
// Source: spec.md > Requirement: 観察 pass の意味論を維持する
//         > Scenario: 観察 pass 後に spec-review は再実行されない
// RED: currently spec-fixer → test-case-gen (not test-materialize) after observation pass
// ---------------------------------------------------------------------------

describe("TC-011: 観察 pass 後に spec-review は再実行されない（integration）", () => {
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

  it("TC-011: 観察 pass では spec-review は 1 回だけ実行され test-materialize に到達する", async () => {
    let specReviewCount = 0;
    let specFixerCount = 0;
    let testCaseGenCount = 0;
    let testMaterializeCount = 0;

    const events = new EventBus();
    const specReviewFindings = [makeFinding("medium", "fixable", SPEC_MD)];

    const executeSpy = vi.fn().mockImplementation(
      async (step: Step, state: JobState): Promise<JobState> => {
        const now = new Date().toISOString();

        if (step.name === STEP_NAMES.SPEC_REVIEW) {
          specReviewCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.SPEC_REVIEW]: [
                ...(state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? []),
                makeStepRun({
                  verdict: "approved",
                  findings: specReviewFindings,
                  startedAt: now,
                  endedAt: now,
                  attempt: specReviewCount,
                }),
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.SPEC_FIXER) {
          specFixerCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.SPEC_FIXER]: [
                ...(state.steps?.[STEP_NAMES.SPEC_FIXER] ?? []),
                makeStepRun({
                  verdict: "approved",
                  startedAt: now,
                  endedAt: now,
                  attempt: specFixerCount,
                }),
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.TEST_CASE_GEN) {
          testCaseGenCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.TEST_CASE_GEN]: [
                ...(state.steps?.[STEP_NAMES.TEST_CASE_GEN] ?? []),
                makeStepRun({ verdict: "success", startedAt: now, endedAt: now }),
              ],
            },
          };
        }

        if (step.name === STEP_NAMES.TEST_MATERIALIZE) {
          testMaterializeCount++;
          return {
            ...state,
            steps: {
              ...(state.steps ?? {}),
              [STEP_NAMES.TEST_MATERIALIZE]: [
                ...(state.steps?.[STEP_NAMES.TEST_MATERIALIZE] ?? []),
                makeStepRun({ verdict: "success", startedAt: now, endedAt: now }),
              ],
            },
          };
        }

        throw new Error(`TC-011: unexpected step ${step.name}`);
      },
    );

    // Include spec-phase transitions + test-case-gen + terminals for test-materialize
    const specPhaseTransitions = [
      ...STANDARD_TRANSITIONS.filter(
        (t) =>
          t.step === STEP_NAMES.SPEC_REVIEW ||
          t.step === STEP_NAMES.SPEC_FIXER ||
          t.step === STEP_NAMES.TEST_CASE_GEN,
      ),
      { step: STEP_NAMES.TEST_MATERIALIZE, on: "success", to: "end" as const },
      { step: STEP_NAMES.TEST_MATERIALIZE, on: "error", to: "escalate" as const },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.SPEC_REVIEW, makeStep(STEP_NAMES.SPEC_REVIEW)],
        [STEP_NAMES.SPEC_FIXER, makeStep(STEP_NAMES.SPEC_FIXER)],
        [STEP_NAMES.TEST_CASE_GEN, makeStep(STEP_NAMES.TEST_CASE_GEN)],
        [STEP_NAMES.TEST_MATERIALIZE, makeStep(STEP_NAMES.TEST_MATERIALIZE)],
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
    await pipeline.run(
      STEP_NAMES.SPEC_REVIEW,
      initialState,
      makeIntegrationDeps(TEST_SLUG, "spec-change"),
    );

    // TC-011 assertions:
    // 1. spec-review ran exactly once (observation pass uses no extra budget)
    expect(specReviewCount).toBe(1);
    // 2. spec-fixer ran exactly once (observation pass consumed fixable findings)
    expect(specFixerCount).toBe(1);
    // 3. test-materialize was reached (pipeline did NOT re-run spec-review)
    expect(testMaterializeCount).toBe(1);
    // 4. test-case-gen was NOT called during observation pass
    expect(testCaseGenCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: 通常 type の spec-review 入力に test-cases.md が含まれる
// Source: spec.md > Requirement: spec-review は test-cases.md を照合対象に含める
//         > Scenario: 通常 type の spec-review 入力に test-cases.md が含まれる
// RED: currently spec-review reads() does not include test-cases.md
// ---------------------------------------------------------------------------

describe("TC-012: 通常 type の spec-review 入力に test-cases.md が含まれる", () => {
  it("TC-012: SpecReviewStep.reads() は非免除 type（spec-change）で test-cases.md を含む", () => {
    const state = makeMinimalJobState({
      request: { path: REQUEST_MD, title: "Test", type: "spec-change", slug: TEST_SLUG },
    });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");
    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths).toContain(`${FOLDER}/test-cases.md`);
  });

  it("TC-012: SpecReviewStep.reads() は new-feature type でも test-cases.md を含む", () => {
    const slug = "another-feature";
    const folder = `specrunner/changes/${slug}`;
    const state = makeMinimalJobState({
      request: { path: `${folder}/request.md`, title: "Feature", type: "new-feature", slug },
    });
    const deps = makeMinimalDeps(slug, "new-feature");
    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths).toContain(`${folder}/test-cases.md`);
  });

  it("TC-012: SpecReviewStep.reads() は既存入力（spec.md / design.md / tasks.md）を保持する", () => {
    const state = makeMinimalJobState({
      request: { path: REQUEST_MD, title: "Test", type: "spec-change", slug: TEST_SLUG },
    });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");
    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths.some((p) => p.endsWith("spec.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("design.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("tasks.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-014: spec-review prompt に TC 照合観点が含まれる
// Source: spec.md > Requirement: spec-review は test-cases.md を照合対象に含める
//         > Scenario: spec-review prompt に TC 照合観点が含まれる
// RED: currently prompt does not have TC照合観点
// ---------------------------------------------------------------------------

describe("TC-014: spec-review prompt に TC 照合観点が含まれる", () => {
  it("TC-014: SPEC_REVIEW_SYSTEM_PROMPT に test-cases.md への参照が含まれる", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("test-cases.md");
  });

  it("TC-014: SPEC_REVIEW_SYSTEM_PROMPT に TC↔spec の Scenario 網羅性照合観点が含まれる", () => {
    // After T-07: prompt must include TC coverage against spec Scenario/Requirement
    const hasScenarioCoverage =
      SPEC_REVIEW_SYSTEM_PROMPT.includes("Scenario") &&
      SPEC_REVIEW_SYSTEM_PROMPT.includes("test-cases");
    expect(hasScenarioCoverage).toBe(true);
  });

  it("TC-014: SPEC_REVIEW_SYSTEM_PROMPT に TC 抽象度逸脱（実装構造への踏み込み）の照合指示が含まれる", () => {
    // After T-07: prompt must check TC abstraction level
    const hasAbstractionCheck =
      SPEC_REVIEW_SYSTEM_PROMPT.includes("抽象度") ||
      (SPEC_REVIEW_SYSTEM_PROMPT.includes("実装") && SPEC_REVIEW_SYSTEM_PROMPT.includes("test-cases"));
    expect(hasAbstractionCheck).toBe(true);
  });

  it("TC-014: SPEC_REVIEW_SYSTEM_PROMPT に tasks↔TC の実装計画の穴の照合観点が含まれる", () => {
    // After T-07: prompt must check tasks vs TC consistency
    const hasTasksTcCheck =
      SPEC_REVIEW_SYSTEM_PROMPT.includes("tasks") &&
      SPEC_REVIEW_SYSTEM_PROMPT.includes("TC");
    expect(hasTasksTcCheck).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015: test-case-gen prompt に振る舞いレベル指示が含まれる
// Source: spec.md > Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない
//         > Scenario: test-case-gen prompt に振る舞いレベル指示が含まれる
// RED: currently prompt does not have 振る舞いレベル指示 (behavior-level instruction)
// ---------------------------------------------------------------------------

describe("TC-015: test-case-gen prompt に振る舞いレベル指示が含まれる", () => {
  it("TC-015: TEST_CASE_GEN_SYSTEM_PROMPT に実装構造への踏み込みを禁じる振る舞いレベル記述指示が含まれる", () => {
    // After T-08: must include instruction to avoid implementation structure
    const hasAbstractionInstruction =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("実装の API") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("実装構造") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("assertion の形式") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("踏み込まない") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("振る舞いレベル");
    expect(hasAbstractionInstruction).toBe(true);
  });

  it("TC-015: TEST_CASE_GEN_SYSTEM_PROMPT に tasks と TC 不整合は申し送り注記として記録する指示が含まれる", () => {
    // After T-08: must instruct to record inconsistency as memo, not fix tasks.md
    const hasMemoInstruction =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("申し送り") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("spec-review に委ねる") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("判定は spec-review");
    expect(hasMemoInstruction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016: test-case-gen の write 宣言は test-cases.md のみ
// Source: spec.md > Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない
//         > Scenario: test-case-gen の write 宣言は test-cases.md のみ
// GREEN: currently TestCaseGenStep.writes() returns only test-cases.md
// ---------------------------------------------------------------------------

describe("TC-016: test-case-gen の write 宣言は test-cases.md のみ", () => {
  it("TC-016: TestCaseGenStep.writes() は test-cases.md のみを返す（1 エントリ）", () => {
    const state = makeMinimalJobState({ branch: `change/${TEST_SLUG}-abc12345` });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");
    const refs = TestCaseGenStep.writes!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe(`${FOLDER}/test-cases.md`);
  });

  it("TC-016: TestCaseGenStep.writes() は tasks.md を含まない", () => {
    const state = makeMinimalJobState({ branch: `change/${TEST_SLUG}-abc12345` });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");
    const refs = TestCaseGenStep.writes!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths.some((p) => p.endsWith("tasks.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: spec-review の test-cases.md fixable finding は needs-fix になる
// Source: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する
//         > Scenario: spec-review の test-cases.md fixable finding は needs-fix になる
// RED: currently deriveSpecReviewVerdict escalates for test-cases.md (unroutable by spec-fixer)
// ---------------------------------------------------------------------------

describe("TC-017: spec-review の test-cases.md fixable finding は needs-fix になる", () => {
  it("TC-017: deriveSpecReviewVerdict(test-cases.md fixable, high) === 'needs-fix'（escalation でない）", () => {
    const findings = [makeFinding("high", "fixable", TEST_CASES_MD)];
    // canonScope with test-case-gen writable for test-cases.md (T-01 adds this)
    const canonScope = makeCanonScopeWithTcGen();
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-017: deriveSpecReviewVerdict(test-cases.md fixable, medium) === 'needs-fix'（severity 問わず）", () => {
    // Per D3-4b: TC findings trigger needs-fix regardless of severity (not observation auto-fix)
    const findings = [makeFinding("medium", "fixable", TEST_CASES_MD)];
    const canonScope = makeCanonScopeWithTcGen();
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-017: deriveSpecReviewVerdict(test-cases.md fixable, low) === 'needs-fix'（low severity も needs-fix）", () => {
    const findings = [makeFinding("low", "fixable", TEST_CASES_MD)];
    const canonScope = makeCanonScopeWithTcGen();
    const verdict = deriveSpecReviewVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-018: 再生成時に TC finding が test-case-gen へ渡される
// Source: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する
//         > Scenario: 再生成時に TC finding が test-case-gen へ渡される
// RED: currently TestCaseGenStep.buildMessage does not inject spec-review findings
// ---------------------------------------------------------------------------

describe("TC-018: 再生成時に TC finding が test-case-gen へ渡される", () => {
  it("TC-018: spec-review に test-cases.md finding がある state で buildMessage は当該 finding 本文を含む", () => {
    const uniqueTitle = "TC-001 のシナリオ参照が仕様の Scenario と不一致";
    const tcFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: TEST_CASES_MD,
      title: uniqueTitle,
      rationale: "Scenario: TC-001 の GWT 記述が実装詳細を含んでいる",
    };

    const state = makeMinimalJobState({
      branch: `change/${TEST_SLUG}-abc12345`,
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "needs-fix", findings: [tcFinding] }),
        ],
      },
    });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");

    const message = TestCaseGenStep.buildMessage(state, deps);

    // After T-06: message must include TC finding title for resolver to act on
    expect(message).toContain(uniqueTitle);
  });

  it("TC-018: spec-review run が無い（初回生成）状態では buildMessage は finding 埋め込みなし", () => {
    const state = makeMinimalJobState({
      branch: `change/${TEST_SLUG}-abc12345`,
      steps: {},
    });
    const deps = makeMinimalDeps(TEST_SLUG, "spec-change");

    const message = TestCaseGenStep.buildMessage(state, deps);

    // Initial generation: message is valid (contains folder path and user-request XML)
    expect(message).toContain(changeFolderPath(TEST_SLUG));
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");
  });
});

// ---------------------------------------------------------------------------
// TC-019: 承認後の test-cases.md finding は operator 保護される
// Source: spec.md > Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する
//         > Scenario: 承認後の test-cases.md finding は operator 保護される
// GREEN: conformance uses conformanceEffectiveFixer (implementer can't write test-cases.md → escalation)
//        judge uses judgeEffectiveFixer (code-fixer can't write test-cases.md → escalation)
// ---------------------------------------------------------------------------

describe("TC-019: 承認後の test-cases.md finding は operator 保護される", () => {
  it("TC-019: deriveConformanceVerdict(test-cases.md fixable, high) === 'escalation'", () => {
    const findings = [makeFinding("high", "fixable", TEST_CASES_MD)];
    // Post-approval canon scope: no test-case-gen in writableByFixer
    const canonScope = makeCanonScopeWithoutTcGen();
    const verdict = deriveConformanceVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("escalation");
  });

  it("TC-019: deriveConformanceVerdict(test-cases.md fixable, medium) === 'escalation'（severity 問わず）", () => {
    // Medium: base verdict = approved, but canon check fires → escalation
    const findings = [makeFinding("medium", "fixable", TEST_CASES_MD)];
    const canonScope = makeCanonScopeWithoutTcGen();
    const verdict = deriveConformanceVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("escalation");
  });

  it("TC-019: deriveJudgeVerdict(test-cases.md fixable, high) === 'escalation'（code-review path）", () => {
    const findings = [makeFinding("high", "fixable", TEST_CASES_MD)];
    const canonScope = makeCanonScopeWithoutTcGen();
    const verdict = deriveJudgeVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("escalation");
  });

  it("TC-019: deriveJudgeVerdict(test-cases.md fixable, medium) === 'escalation'（severity 問わず）", () => {
    // Medium: would be approved normally, but canon check → escalation
    const findings = [makeFinding("medium", "fixable", TEST_CASES_MD)];
    const canonScope = makeCanonScopeWithoutTcGen();
    const verdict = deriveJudgeVerdict(findings, true, undefined, canonScope);
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-021: specFixerObservationForward が観察 pass 検出を正しく担う (should)
// Source: design.md > D2; tasks.md > T-03
// RED: specFixerObservationForward not yet exported (renamed from specFixerForwardsToTestGen in T-03)
// ---------------------------------------------------------------------------

describe("TC-021: specFixerObservationForward が観察 pass 検出を正しく担う (should)", () => {
  it("TC-021: specFixerObservationForward は spec-observation.ts からエクスポートされる", () => {
    expect(specFixerObservationForward).toBeDefined();
    expect(typeof specFixerObservationForward).toBe("function");
  });

  it("TC-021: specFixerObservationForward は observation pass 状態（spec-review approved, 非 conformance）で true を返す", () => {
    if (!specFixerObservationForward) return;

    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "approved",
            findings: [makeFinding("medium", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });
    expect(specFixerObservationForward(state)).toBe(true);
  });

  it("TC-021: specFixerObservationForward は needs-fix spec-review 状態で false を返す", () => {
    if (!specFixerObservationForward) return;

    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });
    expect(specFixerObservationForward(state)).toBe(false);
  });

  it("TC-021: specFixerObservationForward は spec-review run が無い状態で false を返す", () => {
    if (!specFixerObservationForward) return;
    const state = makeMinimalJobState(); // no steps
    expect(specFixerObservationForward(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-022: specFixerNeedsFixForward が needs-fix/conformance-triggered で正しく真偽を返す (should)
// Source: design.md > D2; tasks.md > T-03
// RED: specFixerNeedsFixForward not yet implemented
// ---------------------------------------------------------------------------

describe("TC-022: specFixerNeedsFixForward が needs-fix/conformance-triggered で正しく真偽を返す (should)", () => {
  it("TC-022: specFixerNeedsFixForward は spec-observation.ts からエクスポートされる", () => {
    expect(specFixerNeedsFixForward).toBeDefined();
    expect(typeof specFixerNeedsFixForward).toBe("function");
  });

  it("TC-022 ケース A: specFixerNeedsFixForward は needs-fix spec-review 状態（非 conformance）で true を返す", () => {
    if (!specFixerNeedsFixForward) return;

    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: t1,
            endedAt: t1,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });
    expect(specFixerNeedsFixForward(state)).toBe(true);
  });

  it("TC-022 ケース B: specFixerNeedsFixForward は conformance-triggered 状態で false を返す", () => {
    if (!specFixerNeedsFixForward) return;

    // Conformance-triggered: conformance needs-fix:spec-fixer ran after spec-review
    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const t3 = "2026-01-01T00:03:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", startedAt: t1, endedAt: t1 }),
        ],
        [STEP_NAMES.CONFORMANCE]: [
          makeStepRun({
            verdict: `needs-fix:${STEP_NAMES.SPEC_FIXER}`,
            findings: [makeFinding("high", "fixable", SPEC_MD)],
            startedAt: t2,
            endedAt: t2,
          }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t3, endedAt: t3 }),
        ],
      },
    });
    expect(specFixerNeedsFixForward(state)).toBe(false);
  });

  it("TC-022: specFixerNeedsFixForward は approved spec-review 状態（observation pass）で false を返す", () => {
    if (!specFixerNeedsFixForward) return;

    const t1 = "2026-01-01T00:01:00.000Z";
    const t2 = "2026-01-01T00:02:00.000Z";
    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({ verdict: "approved", startedAt: t1, endedAt: t1 }),
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          makeStepRun({ verdict: "approved", startedAt: t2, endedAt: t2 }),
        ],
      },
    });
    expect(specFixerNeedsFixForward(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-026: 組み替え後の STANDARD_TRANSITIONS の行数は 52 (should)
// Source: design.md > D1; tasks.md > T-04
// RED: currently 49 rows
// ---------------------------------------------------------------------------

describe("TC-026: 組み替え後の STANDARD_TRANSITIONS の行数は 52 (should)", () => {
  it("TC-026: STANDARD_TRANSITIONS.length === 52（旧 49 + 3 行増）", () => {
    expect(STANDARD_TRANSITIONS.length).toBe(52);
  });
});

// ---------------------------------------------------------------------------
// TC-028: TC と severity 問わず spec routable finding の混在では specReviewNeedsFixIsTcOnly が false (must)
// Source: tasks.md > T-10 acceptance criteria
// RED: specReviewNeedsFixIsTcOnly not yet implemented
// ---------------------------------------------------------------------------

describe("TC-028: TC と spec routable finding の混在では specReviewNeedsFixIsTcOnly が false (must)", () => {
  it("TC-028: specReviewNeedsFixIsTcOnly は spec-observation.ts からエクスポートされる", () => {
    expect(specReviewNeedsFixIsTcOnly).toBeDefined();
    expect(typeof specReviewNeedsFixIsTcOnly).toBe("function");
  });

  it("TC-028: TC finding + medium severity spec finding 混在で specReviewNeedsFixIsTcOnly === false", () => {
    if (!specReviewNeedsFixIsTcOnly) return;

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [
              makeFinding("high", "fixable", TEST_CASES_MD), // TC finding
              makeFinding("medium", "fixable", SPEC_MD),     // spec finding (medium)
            ],
          }),
        ],
      },
    });

    // spec finding present → not TC-only → false
    expect(specReviewNeedsFixIsTcOnly(state)).toBe(false);
  });

  it("TC-028: TC finding + low severity spec finding 混在で specReviewNeedsFixIsTcOnly === false（severity 問わず）", () => {
    if (!specReviewNeedsFixIsTcOnly) return;

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [
              makeFinding("high", "fixable", TEST_CASES_MD), // TC finding
              makeFinding("low", "fixable", SPEC_MD),         // low severity spec finding
            ],
          }),
        ],
      },
    });

    // Even low severity spec finding → not TC-only → false
    expect(specReviewNeedsFixIsTcOnly(state)).toBe(false);
  });

  it("TC-028: TC finding のみの場合 specReviewNeedsFixIsTcOnly === true（TC-only 正例確認）", () => {
    if (!specReviewNeedsFixIsTcOnly) return;

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", TEST_CASES_MD)],
          }),
        ],
      },
    });

    // TC-only → true (routable to test-case-gen directly)
    expect(specReviewNeedsFixIsTcOnly(state)).toBe(true);
  });

  it("TC-028: TC finding が無い場合 specReviewNeedsFixIsTcOnly === false", () => {
    if (!specReviewNeedsFixIsTcOnly) return;

    const state = makeMinimalJobState({
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          makeStepRun({
            verdict: "needs-fix",
            findings: [makeFinding("high", "fixable", SPEC_MD)], // spec only, no TC
          }),
        ],
      },
    });

    expect(specReviewNeedsFixIsTcOnly(state)).toBe(false);
  });
});
