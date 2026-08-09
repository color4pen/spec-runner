/**
 * Unit tests for src/core/step/custom-reviewer-round-context.ts (new module).
 *
 * Source: specrunner/changes/custom-reviewer-round-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * These tests FAIL until custom-reviewer-round-context.ts is created (RED phase).
 *
 * TC-003: 前周 findings が欠落しているとき block を省略する (must)
 * TC-004: commit 変更 file の導出が失敗するとき block を省略する (must)
 * TC-005: deriveCustomReviewerPriorRound — runtimeStrategy が undefined で null を返す (must)
 * TC-006: deriveCustomReviewerPriorRound — 前周 endedAt より後の code-fixer commit を union する (must)
 * TC-007: deriveCustomReviewerPriorRound — 複数の code-fixer commit を union する (重複除去) (must)
 * TC-008: deriveCustomReviewerPriorRound — 1 件でも listCommitChangedFiles が失敗なら null (all-or-nothing) (must)
 * TC-009: deriveCustomReviewerPriorRound — findings が空配列でも changedFiles があれば非 null を返す (should)
 * TC-010: deriveCustomReviewerPriorRound — 前周 reviewer StepRun が存在しない (iteration=2 相当だが runs 無し) で null (should)
 * TC-011: buildCustomReviewerPriorRoundBlock — 出力が prior-round-context XML タグで囲まれる (must)
 * TC-012: buildCustomReviewerPriorRoundBlock — findings の severity/resolution/file/title が展開される (must)
 * TC-013: buildCustomReviewerPriorRoundBlock — 再指摘プロトコル text を含む (must)
 * TC-014: buildCustomReviewerPriorRoundBlock — findings が空配列のとき「前周指摘なし」相当の文言を含む (should)
 * TC-015: buildCustomReviewerPriorRoundBlock — changedFiles が空配列のとき「変更なし(machine-derived)」相当の文言を含む (should)
 * TC-016: 裁定記録が存在するとき裁定 block が注入される (must)
 * TC-017: 裁定記録が無いとき裁定 block を注入しない (must)
 * TC-018: deriveOperatorAdjudicationContext — operatorAdjudications のみ存在・decisions 空 → 非 null (must)
 * TC-019: deriveOperatorAdjudicationContext — decisions のみ存在・operatorAdjudications 空 → 非 null (must)
 * TC-020: buildOperatorAdjudicationBlock — operator-adjudication XML タグで囲まれる (must)
 * TC-021: buildOperatorAdjudicationBlock — 反論プロトコル text を含む (must)
 * TC-022: buildOperatorAdjudicationBlock — operator 自由記述の XML 特殊文字をエスケープする (must)
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { JobState } from "../../../state/schema.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Types for the new module (not yet implemented)
// ---------------------------------------------------------------------------

type PriorRoundCtx = {
  findings: { severity: string; resolution: string; file: string; title: string }[];
  changedFiles: string[];
};

type AdjudicationEntry = { text: string; step: string; recordedAt: string };
type DecisionEntry = {
  step: string;
  title: string;
  file: string;
  selectedOption: string;
  consequence: string;
  rationale: string;
};
type OperatorAdjudicationCtx = {
  adjudications: AdjudicationEntry[];
  decisions: DecisionEntry[];
};

type DeriveCustomReviewerPriorRoundFn = (params: {
  state: JobState;
  reviewerName: string;
  iteration: number;
  cwd: string;
  runtimeStrategy: unknown;
}) => Promise<PriorRoundCtx | null>;

type BuildCustomReviewerPriorRoundBlockFn = (ctx: PriorRoundCtx) => string;

type DeriveOperatorAdjudicationContextFn = (state: JobState) => OperatorAdjudicationCtx | null;

type BuildOperatorAdjudicationBlockFn = (ctx: OperatorAdjudicationCtx) => string;

// ---------------------------------------------------------------------------
// Dynamic module load — custom-reviewer-round-context.ts does not exist yet (RED phase)
// ---------------------------------------------------------------------------

let deriveCustomReviewerPriorRound: DeriveCustomReviewerPriorRoundFn | undefined;
let buildCustomReviewerPriorRoundBlock: BuildCustomReviewerPriorRoundBlockFn | undefined;
let deriveOperatorAdjudicationContext: DeriveOperatorAdjudicationContextFn | undefined;
let buildOperatorAdjudicationBlock: BuildOperatorAdjudicationBlockFn | undefined;

beforeAll(async () => {
  try {
    const mod = await import("../custom-reviewer-round-context.js") as Record<string, unknown>;
    deriveCustomReviewerPriorRound = mod["deriveCustomReviewerPriorRound"] as DeriveCustomReviewerPriorRoundFn | undefined;
    buildCustomReviewerPriorRoundBlock = mod["buildCustomReviewerPriorRoundBlock"] as BuildCustomReviewerPriorRoundBlockFn | undefined;
    deriveOperatorAdjudicationContext = mod["deriveOperatorAdjudicationContext"] as DeriveOperatorAdjudicationContextFn | undefined;
    buildOperatorAdjudicationBlock = mod["buildOperatorAdjudicationBlock"] as BuildOperatorAdjudicationBlockFn | undefined;
  } catch {
    // Module not yet created — each test will fail individually with a clear message
  }
});

// ---------------------------------------------------------------------------
// Timestamps (ordered for deterministic fixture building)
// ---------------------------------------------------------------------------
const T0 = "2026-01-01T00:00:00.000Z"; // earliest
const T1 = "2026-01-01T01:00:00.000Z";
const T2 = "2026-01-01T02:00:00.000Z";
const T3 = "2026-01-01T03:00:00.000Z"; // latest

const REVIEWER_NAME = "security";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "custom-reviewer-round-context-test-job",
    createdAt: T0,
    updatedAt: T0,
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test Request",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: REVIEWER_NAME,
    status: "running",
    branch: "feat/test-slug-abc12345",
    history: [],
    error: null,
    steps: {},
  };
}

/** Build a state where the custom reviewer ran once in round 1 (endedAt=T1) */
function makeStateWithPriorReviewerRun(opts: {
  reviewerName?: string;
  findings?: { severity: string; resolution: string; file: string; title: string }[];
  endedAt?: string;
  codeFixerRuns?: Array<{ commitOid?: string; endedAt: string }>;
} = {}): JobState {
  const reviewerName = opts.reviewerName ?? REVIEWER_NAME;
  const findings = opts.findings ?? [
    { severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard", rationale: "test" },
  ];
  const reviewerEndedAt = opts.endedAt ?? T1;
  const codeFixerRuns = opts.codeFixerRuns ?? [];

  const reviewerRuns = [
    {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "needs-fix",
        findingsPath: null,
        error: null,
        toolResult: { ok: true, findings },
      },
      startedAt: T0,
      endedAt: reviewerEndedAt,
    },
  ];

  const fixerRunsList = codeFixerRuns.map((r, i) => ({
    attempt: i + 1,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
    startedAt: T0,
    endedAt: r.endedAt,
    ...(r.commitOid !== undefined ? { commitOid: r.commitOid } : {}),
  }));

  return {
    ...makeBaseState(),
    steps: {
      [reviewerName]: reviewerRuns,
      ...(fixerRunsList.length > 0 ? { [STEP_NAMES.CODE_FIXER]: fixerRunsList } : {}),
    },
  };
}

/** Make a fake RuntimeStrategy with listCommitChangedFiles */
function makeFakeRuntimeStrategy(opts: {
  files?: string[];
  kind?: "success" | "unavailable";
  shouldThrow?: boolean;
} = {}) {
  const kind = opts.kind ?? "success";
  const files = opts.files ?? ["src/auth.ts"];
  const shouldThrow = opts.shouldThrow ?? false;
  return {
    listCommitChangedFiles: async (_oid: string, _cwd: string) => {
      if (shouldThrow) throw new Error("listCommitChangedFiles port error");
      if (kind === "unavailable") {
        return { kind: "unavailable" as const, reason: "test-unavailable" };
      }
      return { kind: "success" as const, files };
    },
  };
}

// ===========================================================================
// Group 1: deriveCustomReviewerPriorRound
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-003 (must): 前周 findings が欠落しているとき block を省略する
// ---------------------------------------------------------------------------

describe("TC-003: 前周 findings が欠落しているとき block を省略する", () => {
  it("TC-003: returns null when prior reviewer StepRun has no toolResult.findings", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    // Reviewer ran once but toolResult.findings is absent
    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [REVIEWER_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "needs-fix",
              findingsPath: null,
              error: null,
              // toolResult absent — no findings
            },
            startedAt: T0,
            endedAt: T1,
          },
        ],
        [STEP_NAMES.CODE_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
            startedAt: T1,
            endedAt: T2,
            commitOid: "oid1",
          },
        ],
      },
    };

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: makeFakeRuntimeStrategy(),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-004 (must): commit 変更 file の導出が失敗するとき block を省略する
// ---------------------------------------------------------------------------

describe("TC-004: commit 変更 file の導出が失敗するとき block を省略する", () => {
  it("TC-004: returns null when listCommitChangedFiles returns unavailable", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      codeFixerRuns: [{ commitOid: "oid1", endedAt: T2 }],
    });

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: makeFakeRuntimeStrategy({ kind: "unavailable" }),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-004: returns null and does not throw when listCommitChangedFiles throws", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      codeFixerRuns: [{ commitOid: "oid1", endedAt: T2 }],
    });

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: makeFakeRuntimeStrategy({ shouldThrow: true }),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-004: step continues normally (no exception propagated)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      codeFixerRuns: [{ commitOid: "oid1", endedAt: T2 }],
    });

    // Must not throw even when port is broken
    await expect(
      deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: makeFakeRuntimeStrategy({ shouldThrow: true }),
      }),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-005 (must): deriveCustomReviewerPriorRound — runtimeStrategy が undefined で null を返す
// ---------------------------------------------------------------------------

describe("TC-005: deriveCustomReviewerPriorRound — runtimeStrategy が undefined で null を返す", () => {
  it("TC-005: returns null when runtimeStrategy is undefined (managed runtime equivalent)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      codeFixerRuns: [{ commitOid: "oid1", endedAt: T2 }],
    });

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: undefined,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-006 (must): deriveCustomReviewerPriorRound — 前周 endedAt より後の code-fixer commit を union する
// ---------------------------------------------------------------------------

describe("TC-006: deriveCustomReviewerPriorRound — 前周 endedAt より後の code-fixer commit を union する", () => {
  it("TC-006: only unions commits after reviewer's prior-round endedAt, not before", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    // Reviewer ran at T1. Code-fixer has two runs:
    // - oid-before: endedAt=T0 (before T1) → should be excluded
    // - oid-after:  endedAt=T2 (after T1)  → should be included
    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [REVIEWER_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "needs-fix",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [{ severity: "high", resolution: "fixable", file: "src/a.ts", title: "T", rationale: "test" }] },
            },
            startedAt: T0,
            endedAt: T1, // prior reviewer endedAt
          },
        ],
        [STEP_NAMES.CODE_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
            startedAt: T0,
            endedAt: T0, // before reviewer endedAt T1
            commitOid: "oid-before",
          },
          {
            attempt: 2,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
            startedAt: T1,
            endedAt: T2, // after reviewer endedAt T1
            commitOid: "oid-after",
          },
        ],
      },
    };

    // oid-before → ["old-file.ts"], oid-after → ["new-file.ts"]
    const strategy = {
      listCommitChangedFiles: async (oid: string, _cwd: string) => {
        if (oid === "oid-before") return { kind: "success" as const, files: ["old-file.ts"] };
        if (oid === "oid-after") return { kind: "success" as const, files: ["new-file.ts"] };
        return { kind: "unavailable" as const, reason: "unknown oid" };
      },
    };

    const result = await deriveCustomReviewerPriorRound!({
      state,
      reviewerName: REVIEWER_NAME,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: strategy,
    });

    expect(result).not.toBeNull();
    // oid-after's file is included
    expect(result!.changedFiles).toContain("new-file.ts");
    // oid-before's file is excluded (commit was before the reviewer's prior round)
    expect(result!.changedFiles).not.toContain("old-file.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-007 (must): deriveCustomReviewerPriorRound — 複数の code-fixer commit を union する (重複除去)
// ---------------------------------------------------------------------------

describe("TC-007: deriveCustomReviewerPriorRound — 複数の code-fixer commit を union する (重複除去)", () => {
  it("TC-007: changedFiles is the union with deduplication of multiple commits after reviewer endedAt", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      endedAt: T1, // reviewer ran at T1
      codeFixerRuns: [
        { commitOid: "oid1", endedAt: T2 }, // after T1
        { commitOid: "oid2", endedAt: T3 }, // after T1
      ],
    });

    const strategy = {
      listCommitChangedFiles: async (oid: string, _cwd: string) => {
        if (oid === "oid1") return { kind: "success" as const, files: ["a.ts", "b.ts"] };
        if (oid === "oid2") return { kind: "success" as const, files: ["b.ts", "c.ts"] };
        return { kind: "unavailable" as const, reason: "unknown oid" };
      },
    };

    const result = await deriveCustomReviewerPriorRound!({
      state,
      reviewerName: REVIEWER_NAME,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: strategy,
    });

    expect(result).not.toBeNull();
    const changedFiles = result!.changedFiles;
    // Must include all three files
    expect(changedFiles).toContain("a.ts");
    expect(changedFiles).toContain("b.ts");
    expect(changedFiles).toContain("c.ts");
    // b.ts should appear only once (deduplication)
    expect(changedFiles.filter((f) => f === "b.ts")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-008 (must): deriveCustomReviewerPriorRound — 1 件でも listCommitChangedFiles が失敗なら null (all-or-nothing)
// ---------------------------------------------------------------------------

describe("TC-008: deriveCustomReviewerPriorRound — 1 件でも listCommitChangedFiles が失敗なら null (all-or-nothing)", () => {
  it("TC-008: returns null when any commit's listCommitChangedFiles throws (all-or-nothing)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      endedAt: T1,
      codeFixerRuns: [
        { commitOid: "oid1", endedAt: T2 },
        { commitOid: "oid2", endedAt: T3 }, // this one will throw
      ],
    });

    let callCount = 0;
    const partialThrowStrategy = {
      listCommitChangedFiles: async (_oid: string, _cwd: string) => {
        callCount++;
        if (callCount >= 2) throw new Error("second call fails");
        return { kind: "success" as const, files: ["a.ts"] };
      },
    };

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: partialThrowStrategy,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // All-or-nothing: partial failure → null (no partial injection)
    expect(result).toBeNull();
  });

  it("TC-008: returns null when one commit returns unavailable (all-or-nothing)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state = makeStateWithPriorReviewerRun({
      endedAt: T1,
      codeFixerRuns: [
        { commitOid: "oid1", endedAt: T2 },
        { commitOid: "oid2", endedAt: T3 },
      ],
    });

    let callCount = 0;
    const partialUnavailableStrategy = {
      listCommitChangedFiles: async (_oid: string, _cwd: string) => {
        callCount++;
        if (callCount >= 2) return { kind: "unavailable" as const, reason: "second" };
        return { kind: "success" as const, files: ["a.ts"] };
      },
    };

    const result = await deriveCustomReviewerPriorRound!({
      state,
      reviewerName: REVIEWER_NAME,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: partialUnavailableStrategy,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-009 (should): deriveCustomReviewerPriorRound — findings が空配列でも changedFiles があれば非 null を返す
// ---------------------------------------------------------------------------

describe("TC-009 (should): deriveCustomReviewerPriorRound — findings が空配列でも changedFiles があれば非 null を返す", () => {
  it("TC-009: returns { findings: [], changedFiles: [...] } when prior reviewer had no findings (all approved)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [REVIEWER_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] }, // empty findings — all approved
            },
            startedAt: T0,
            endedAt: T1,
          },
        ],
        [STEP_NAMES.CODE_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
            startedAt: T1,
            endedAt: T2,
            commitOid: "oid1",
          },
        ],
      },
    };

    const result = await deriveCustomReviewerPriorRound!({
      state,
      reviewerName: REVIEWER_NAME,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy({ files: ["changed.ts"] }),
    });

    // Empty findings is NOT the same as "missing" — must return non-null
    expect(result).not.toBeNull();
    expect(result!.findings).toEqual([]);
    expect(result!.changedFiles).toContain("changed.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-010 (should): deriveCustomReviewerPriorRound — 前周 reviewer StepRun が存在しない (iteration=2 相当だが runs 無し) で null
// ---------------------------------------------------------------------------

describe("TC-010 (should): deriveCustomReviewerPriorRound — 前周 reviewer StepRun が存在しない (iteration=2 相当だが runs 無し) で null", () => {
  it("TC-010: returns null when state.steps[reviewerName] is empty (no prior run)", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [REVIEWER_NAME]: [], // empty — no prior run despite iteration=2
        [STEP_NAMES.CODE_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
            startedAt: T1,
            endedAt: T2,
            commitOid: "oid1",
          },
        ],
      },
    };

    let threw = false;
    let result: PriorRoundCtx | null | undefined;
    try {
      result = await deriveCustomReviewerPriorRound!({
        state,
        reviewerName: REVIEWER_NAME,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: makeFakeRuntimeStrategy(),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-010: returns null when state.steps[reviewerName] is undefined", async () => {
    expect(deriveCustomReviewerPriorRound).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      steps: {}, // no reviewer steps at all
    };

    const result = await deriveCustomReviewerPriorRound!({
      state,
      reviewerName: REVIEWER_NAME,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy(),
    });

    expect(result).toBeNull();
  });
});

// ===========================================================================
// Group 2: buildCustomReviewerPriorRoundBlock
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-011 (must): buildCustomReviewerPriorRoundBlock — 出力が prior-round-context XML タグで囲まれる
// ---------------------------------------------------------------------------

describe("TC-011: buildCustomReviewerPriorRoundBlock — 出力が prior-round-context XML タグで囲まれる", () => {
  it("TC-011: output starts with <prior-round-context> and ends with </prior-round-context>", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard" }],
      changedFiles: ["src/auth.ts"],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);
    expect(output.trimStart()).toMatch(/^<prior-round-context>/);
    expect(output.trimEnd()).toMatch(/<\/prior-round-context>$/);
  });
});

// ---------------------------------------------------------------------------
// TC-012 (must): buildCustomReviewerPriorRoundBlock — findings の severity/resolution/file/title が展開される
// ---------------------------------------------------------------------------

describe("TC-012: buildCustomReviewerPriorRoundBlock — findings の severity/resolution/file/title が展開される", () => {
  it("TC-012: output contains severity, resolution, file, and title of each finding", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [{ severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Missing guard" }],
      changedFiles: ["src/auth.ts"],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);
    expect(output).toContain("high");
    expect(output).toContain("fixable");
    expect(output).toContain("src/auth.ts");
    expect(output).toContain("Missing guard");
  });

  it("TC-012: multiple findings are all listed in output", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [
        { severity: "high", resolution: "fixable", file: "src/a.ts", title: "Finding A" },
        { severity: "medium", resolution: "manual", file: "src/b.ts", title: "Finding B" },
      ],
      changedFiles: [],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);
    expect(output).toContain("Finding A");
    expect(output).toContain("Finding B");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-013 (must): buildCustomReviewerPriorRoundBlock — 再指摘プロトコル text を含む
// ---------------------------------------------------------------------------

describe("TC-013: buildCustomReviewerPriorRoundBlock — 再指摘プロトコル text を含む", () => {
  it("TC-013: output contains re-inspection protocol referencing Read tool, rationale, and full listing", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [{ severity: "high", resolution: "fixable", file: "src/a.ts", title: "T" }],
      changedFiles: ["src/a.ts"],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);

    // Protocol must reference: Read-before-re-report, rationale requirement, and full listing
    const hasReadProtocol =
      output.includes("Read") ||
      output.includes("read");
    const hasRationaleProtocol =
      output.includes("rationale");
    const hasFullListingProtocol =
      output.includes("全量") ||
      output.includes("全件") ||
      output.includes("all finding") ||
      output.includes("全量列挙");

    expect(hasReadProtocol, "output must reference Read tool protocol").toBe(true);
    expect(hasRationaleProtocol, "output must reference rationale requirement").toBe(true);
    expect(hasFullListingProtocol, "output must reference full listing maintenance").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-014 (should): buildCustomReviewerPriorRoundBlock — findings が空配列のとき「前周指摘なし」相当の文言を含む
// ---------------------------------------------------------------------------

describe("TC-014 (should): buildCustomReviewerPriorRoundBlock — findings が空配列のとき「前周指摘なし」相当の文言を含む", () => {
  it("TC-014: output contains explicit 'no prior findings' text when findings=[]", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [],
      changedFiles: ["src/a.ts"],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);
    const hasNoPriorFindingsText =
      output.includes("前周指摘なし") ||
      output.includes("前周の指摘なし") ||
      output.includes("no prior findings") ||
      output.includes("No prior findings") ||
      output.includes("指摘なし");
    expect(hasNoPriorFindingsText).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-015 (should): buildCustomReviewerPriorRoundBlock — changedFiles が空配列のとき「変更なし(machine-derived)」相当の文言を含む
// ---------------------------------------------------------------------------

describe("TC-015 (should): buildCustomReviewerPriorRoundBlock — changedFiles が空配列のとき「変更なし(machine-derived)」相当の文言を含む", () => {
  it("TC-015: output contains 'no changed files (machine-derived)' text when changedFiles=[]", () => {
    expect(buildCustomReviewerPriorRoundBlock).toBeDefined();

    const ctx: PriorRoundCtx = {
      findings: [{ severity: "high", resolution: "fixable", file: "src/a.ts", title: "T" }],
      changedFiles: [],
    };

    const output = buildCustomReviewerPriorRoundBlock!(ctx);
    const hasNoChangedFilesText =
      output.includes("変更なし") ||
      output.includes("no changed files") ||
      output.includes("No changed files") ||
      output.includes("machine-derived");
    expect(hasNoChangedFilesText).toBe(true);
  });
});

// ===========================================================================
// Group 3: deriveOperatorAdjudicationContext / buildOperatorAdjudicationBlock
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-016 (must): 裁定記録が存在するとき裁定 block が注入される
// ---------------------------------------------------------------------------

describe("TC-016: 裁定記録が存在するとき裁定 block が注入される", () => {
  it("TC-016: deriveOperatorAdjudicationContext returns non-null when operatorAdjudications has entries", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      operatorAdjudications: [{ text: "do not revert auth change", step: "security", recordedAt: T1 }],
    } as JobState & { operatorAdjudications: AdjudicationEntry[] };

    const result = deriveOperatorAdjudicationContext!(state);
    expect(result).not.toBeNull();
  });

  it("TC-016: buildOperatorAdjudicationBlock output includes step label and adjudication text", () => {
    expect(buildOperatorAdjudicationBlock).toBeDefined();

    const ctx: OperatorAdjudicationCtx = {
      adjudications: [{ text: "do not revert auth change", step: "security", recordedAt: T1 }],
      decisions: [],
    };

    const output = buildOperatorAdjudicationBlock!(ctx);
    expect(output).toContain("security");
    expect(output).toContain("do not revert auth change");
  });
});

// ---------------------------------------------------------------------------
// TC-017 (must): 裁定記録が無いとき裁定 block を注入しない
// ---------------------------------------------------------------------------

describe("TC-017: 裁定記録が無いとき裁定 block を注入しない", () => {
  it("TC-017: deriveOperatorAdjudicationContext returns null when both operatorAdjudications and decisions are empty", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      operatorAdjudications: [],
      decisions: [],
    } as JobState & { operatorAdjudications: AdjudicationEntry[] };

    const result = deriveOperatorAdjudicationContext!(state);
    expect(result).toBeNull();
  });

  it("TC-017: deriveOperatorAdjudicationContext returns null when both fields are absent", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    const state: JobState = {
      ...makeBaseState(),
      // no operatorAdjudications, no decisions
    };

    const result = deriveOperatorAdjudicationContext!(state);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-018 (must): deriveOperatorAdjudicationContext — operatorAdjudications のみ存在・decisions 空 → 非 null
// ---------------------------------------------------------------------------

describe("TC-018: deriveOperatorAdjudicationContext — operatorAdjudications のみ存在・decisions 空 → 非 null", () => {
  it("TC-018: returns { adjudications: [...], decisions: [] } when only operatorAdjudications is non-empty", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    const adjudication: AdjudicationEntry = { text: "X", step: "security", recordedAt: T1 };
    const state = {
      ...makeBaseState(),
      operatorAdjudications: [adjudication],
      decisions: [],
    } as unknown as JobState;

    const result = deriveOperatorAdjudicationContext!(state);
    expect(result).not.toBeNull();
    expect(result!.adjudications).toHaveLength(1);
    expect(result!.adjudications[0]!.text).toBe("X");
    expect(result!.decisions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-019 (must): deriveOperatorAdjudicationContext — decisions のみ存在・operatorAdjudications 空 → 非 null
// ---------------------------------------------------------------------------

describe("TC-019: deriveOperatorAdjudicationContext — decisions のみ存在・operatorAdjudications 空 → 非 null", () => {
  it("TC-019: returns { adjudications: [], decisions: [...] } when only decisions is non-empty", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    const decision = {
      id: "decision-1",
      step: "security",
      findingKey: "key1",
      finding: {
        title: "Missing auth",
        file: "src/auth.ts",
        rationale: "important",
        severity: "high" as const,
      },
      selectedOption: { number: 1, label: "accept", consequence: "No change needed" },
      decidedAt: T1,
      source: "issue-comment" as const,
    };

    const state: JobState = {
      ...makeBaseState(),
      decisions: [decision],
    };

    const result = deriveOperatorAdjudicationContext!(state);
    expect(result).not.toBeNull();
    expect(result!.decisions.length).toBeGreaterThan(0);
    expect(result!.adjudications).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-020 (must): buildOperatorAdjudicationBlock — operator-adjudication XML タグで囲まれる
// ---------------------------------------------------------------------------

describe("TC-020: buildOperatorAdjudicationBlock — operator-adjudication XML タグで囲まれる", () => {
  it("TC-020: output starts with <operator-adjudication> and ends with </operator-adjudication>", () => {
    expect(buildOperatorAdjudicationBlock).toBeDefined();

    const ctx: OperatorAdjudicationCtx = {
      adjudications: [{ text: "do not revert auth", step: "security", recordedAt: T1 }],
      decisions: [],
    };

    const output = buildOperatorAdjudicationBlock!(ctx);
    expect(output.trimStart()).toMatch(/^<operator-adjudication>/);
    expect(output.trimEnd()).toMatch(/<\/operator-adjudication>$/);
  });
});

// ---------------------------------------------------------------------------
// TC-021 (must): buildOperatorAdjudicationBlock — 反論プロトコル text を含む
// ---------------------------------------------------------------------------

describe("TC-021: buildOperatorAdjudicationBlock — 反論プロトコル text を含む", () => {
  it("TC-021: output contains rebuttal protocol referencing rationale requirement", () => {
    expect(buildOperatorAdjudicationBlock).toBeDefined();

    const ctx: OperatorAdjudicationCtx = {
      adjudications: [{ text: "keep this pattern", step: "security", recordedAt: T1 }],
      decisions: [],
    };

    const output = buildOperatorAdjudicationBlock!(ctx);

    // Must contain rebuttal protocol: "反論" or "rationale"
    const hasRebuttalProtocol =
      output.includes("反論") ||
      output.includes("rebuttal") ||
      output.includes("rationale");
    expect(hasRebuttalProtocol, "output must contain rebuttal protocol text").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-022 (must): buildOperatorAdjudicationBlock — operator 自由記述の XML 特殊文字をエスケープする
// ---------------------------------------------------------------------------

describe("TC-022: buildOperatorAdjudicationBlock — operator 自由記述の XML 特殊文字をエスケープする", () => {
  it("TC-022: escapes < > & in adjudication text to &lt; &gt; &amp;", () => {
    expect(buildOperatorAdjudicationBlock).toBeDefined();

    const ctx: OperatorAdjudicationCtx = {
      adjudications: [
        { text: "use <b>bold</b> & test > 0", step: "security", recordedAt: T1 },
      ],
      decisions: [],
    };

    const output = buildOperatorAdjudicationBlock!(ctx);

    // Raw < > & must not appear unescaped in the XML block boundary area
    expect(output).toContain("&lt;b&gt;");
    expect(output).toContain("&lt;/b&gt;");
    expect(output).toContain("&amp;");
    expect(output).toContain("&gt; 0");

    // Raw <b> must not appear as a literal tag
    expect(output).not.toContain("<b>");
    expect(output).not.toContain("</b>");
  });

  it("TC-022: & alone is escaped to &amp;", () => {
    expect(buildOperatorAdjudicationBlock).toBeDefined();

    const ctx: OperatorAdjudicationCtx = {
      adjudications: [{ text: "foo & bar", step: "s", recordedAt: T1 }],
      decisions: [],
    };

    const output = buildOperatorAdjudicationBlock!(ctx);
    expect(output).toContain("&amp;");
    // The raw " & " should not appear between non-tag text
    // (allow &amp; but not standalone & followed by space)
    expect(output).not.toMatch(/[^&]& /);
  });
});

// ---------------------------------------------------------------------------
// malformed DecisionRecord: finding / selectedOption の field が欠落しても throw しない
// ---------------------------------------------------------------------------

describe("deriveOperatorAdjudicationContext — malformed decision entry does not throw", () => {
  it("projects undefined fields as empty strings without throwing", () => {
    expect(deriveOperatorAdjudicationContext).toBeDefined();

    // DecisionRecord with all optional text fields absent / null
    const malformed = {
      id: "d1",
      step: "security",
      findingKey: "k1",
      finding: {
        // title, file, rationale absent
        severity: "high" as const,
      },
      selectedOption: {
        number: 1,
        // label, consequence absent
      },
      decidedAt: T1,
      source: "issue-comment" as const,
    };

    const state: JobState = {
      ...makeBaseState(),
      decisions: [malformed] as unknown as JobState["decisions"],
    };

    let result: ReturnType<DeriveOperatorAdjudicationContextFn> | undefined;
    expect(() => {
      result = deriveOperatorAdjudicationContext!(state);
    }).not.toThrow();

    expect(result).not.toBeNull();
    expect(result!.decisions[0]!.title).toBe("");
    expect(result!.decisions[0]!.file).toBe("");
    expect(result!.decisions[0]!.rationale).toBe("");
    expect(result!.decisions[0]!.selectedOption).toBe("");
    expect(result!.decisions[0]!.consequence).toBe("");
  });
});
