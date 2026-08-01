/**
 * Unit tests for src/core/step/prior-round-context.ts (new module).
 *
 * Source: specrunner/changes/spec-review-prior-round-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * These tests FAIL until prior-round-context.ts is created (RED phase).
 *
 * TC-010: resolvePriorFixerOid — 末尾 spec-fixer StepRun の commitOid を返す (must)
 * TC-011: resolvePriorFixerOid — spec-fixer StepRun が無い場合 null を返す (must)
 * TC-012: resolvePriorFixerOid — 末尾 StepRun に commitOid が無い場合 null を返す (must)
 * TC-013: derivePriorRoundContext — iteration 1 で null を返す (must)
 * TC-014: derivePriorRoundContext — runtimeStrategy が undefined で null を返す (must)
 * TC-015: derivePriorRoundContext — 前周 fixer OID あり・mock が files を返す → findings と changedFiles を返す (must)
 * TC-016: buildPriorRoundContextBlock — 出力が prior-round-context XML タグで囲まれる (must)
 * TC-017: buildPriorRoundContextBlock — findings が空配列の場合に「前周指摘なし」を明示する (should)
 * TC-018: buildPriorRoundContextBlock — changedFiles が空配列の場合に変更なし（machine-derived）を明示する (should)
 * TC-019: derivePriorRoundContext — changedFiles が空配列でも null でなく注入オブジェクトを返す (should)
 * TC-029: resolvePriorFixerOid — spec-fixer が複数回実行された場合、末尾（最新）の commitOid が参照される (should)
 * TC-030: managed runtime 相当（listCommitChangedFiles が unavailable）でも step が正常続行する (should)
 * TC-031: getLatestJudgeFindings が空配列を返す（前周が全 approve）でも changedFiles があれば注入する (should)
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { JobState } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Dynamic module load — prior-round-context.ts does not exist yet (RED phase)
// ---------------------------------------------------------------------------

type PriorRoundContext = {
  findings: { severity: string; resolution: string; file: string; title: string }[];
  changedFiles: string[];
};

type ResolvePriorFixerOidFn = (state: JobState) => string | null;
type BuildPriorRoundContextBlockFn = (ctx: PriorRoundContext) => string;
type DerivePriorRoundContextFn = (params: {
  state: JobState;
  iteration: number;
  cwd: string;
  runtimeStrategy: unknown;
}) => Promise<PriorRoundContext | null>;

let resolvePriorFixerOid: ResolvePriorFixerOidFn | undefined;
let buildPriorRoundContextBlock: BuildPriorRoundContextBlockFn | undefined;
let derivePriorRoundContext: DerivePriorRoundContextFn | undefined;

beforeAll(async () => {
  try {
    const mod = await import("../prior-round-context.js") as Record<string, unknown>;
    resolvePriorFixerOid = mod["resolvePriorFixerOid"] as ResolvePriorFixerOidFn | undefined;
    buildPriorRoundContextBlock = mod["buildPriorRoundContextBlock"] as BuildPriorRoundContextBlockFn | undefined;
    derivePriorRoundContext = mod["derivePriorRoundContext"] as DerivePriorRoundContextFn | undefined;
  } catch {
    // Module not yet created — each test will fail individually with a clear message
  }
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_SLUG = "test-slug";
const NOW = "2026-01-01T00:00:00.000Z";

function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "prior-round-context-test-job",
    createdAt: NOW,
    updatedAt: NOW,
    request: {
      path: `specrunner/changes/${TEST_SLUG}/request.md`,
      title: "Test Request",
      type: "spec-change",
      slug: TEST_SLUG,
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: STEP_NAMES.SPEC_REVIEW,
    status: "running",
    branch: `change/${TEST_SLUG}-abc12345`,
    history: [],
    error: null,
    steps: {},
  };
}

/** Default prior findings for test fixtures */
const DEFAULT_PRIOR_FINDINGS: Finding[] = [
  { severity: "medium", resolution: "fixable", file: `specrunner/changes/${TEST_SLUG}/spec.md`, title: "Test finding", rationale: "test" },
];

/**
 * Build a JobState with spec-review run(s) and optional spec-fixer run(s).
 * Simulates a state where spec-review has already run once (iteration = 2 next).
 */
function makeStateWithSpecReviewRun(opts: {
  specReviewFindings?: Finding[];
  specFixerRuns?: Array<{ commitOid?: string }>;
} = {}): JobState {
  const findings = opts.specReviewFindings ?? DEFAULT_PRIOR_FINDINGS;
  const specFixerRuns = (opts.specFixerRuns ?? []).map((r, i) => ({
    attempt: i + 1,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null },
    startedAt: NOW,
    endedAt: NOW,
    ...(r.commitOid !== undefined ? { commitOid: r.commitOid } : {}),
  }));

  return {
    ...makeBaseState(),
    steps: {
      [STEP_NAMES.SPEC_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings },
          },
          startedAt: NOW,
          endedAt: NOW,
        },
      ],
      ...(specFixerRuns.length > 0 ? { [STEP_NAMES.SPEC_FIXER]: specFixerRuns } : {}),
    },
  };
}

/** Make a fake RuntimeStrategy with listCommitChangedFiles returning success */
function makeFakeRuntimeStrategy(opts: {
  files?: string[];
  kind?: "success" | "unavailable";
} = {}) {
  const kind = opts.kind ?? "success";
  const files = opts.files ?? ["specrunner/changes/test-slug/spec.md"];
  return {
    listCommitChangedFiles: async (_oid: string, _cwd: string) => {
      if (kind === "unavailable") {
        return { kind: "unavailable" as const, reason: "test-unavailable" };
      }
      return { kind: "success" as const, files };
    },
  };
}

// ---------------------------------------------------------------------------
// TC-010: resolvePriorFixerOid — 末尾 spec-fixer StepRun の commitOid を返す
// ---------------------------------------------------------------------------

describe("TC-010: resolvePriorFixerOid — 末尾 spec-fixer StepRun の commitOid を返す", () => {
  it("TC-010: returns the commitOid of the last spec-fixer StepRun", () => {
    // TC-010: resolvePriorFixerOid is exported from prior-round-context.ts
    expect(resolvePriorFixerOid).toBeDefined();

    const state = makeStateWithSpecReviewRun({
      specFixerRuns: [{ commitOid: "abc123" }],
    });
    const result = resolvePriorFixerOid!(state);
    expect(result).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// TC-011: resolvePriorFixerOid — spec-fixer StepRun が無い場合 null を返す
// ---------------------------------------------------------------------------

describe("TC-011: resolvePriorFixerOid — spec-fixer StepRun が無い場合 null を返す", () => {
  it("TC-011: returns null when state has no spec-fixer StepRuns (undefined)", () => {
    expect(resolvePriorFixerOid).toBeDefined();
    const state = makeBaseState(); // no steps at all
    const result = resolvePriorFixerOid!(state);
    expect(result).toBeNull();
  });

  it("TC-011: returns null when spec-fixer StepRuns is an empty array", () => {
    expect(resolvePriorFixerOid).toBeDefined();
    const state = {
      ...makeBaseState(),
      steps: { [STEP_NAMES.SPEC_FIXER]: [] },
    };
    const result = resolvePriorFixerOid!(state);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-012: resolvePriorFixerOid — 末尾 StepRun に commitOid が無い場合 null を返す
// ---------------------------------------------------------------------------

describe("TC-012: resolvePriorFixerOid — 末尾 StepRun に commitOid が無い場合 null を返す", () => {
  it("TC-012: returns null when last spec-fixer StepRun has no commitOid", () => {
    expect(resolvePriorFixerOid).toBeDefined();
    const state = makeStateWithSpecReviewRun({
      specFixerRuns: [
        { /* no commitOid */ },
      ],
    });
    const result = resolvePriorFixerOid!(state);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-013: derivePriorRoundContext — iteration 1 で null を返す
// ---------------------------------------------------------------------------

describe("TC-013: derivePriorRoundContext — iteration 1 で null を返す", () => {
  it("TC-013: returns null for iteration=1 (no prior round exists)", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const state = makeBaseState();
    const result = await derivePriorRoundContext!({
      state,
      iteration: 1,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy(),
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-014: derivePriorRoundContext — runtimeStrategy が undefined で null を返す
// ---------------------------------------------------------------------------

describe("TC-014: derivePriorRoundContext — runtimeStrategy が undefined で null を返す", () => {
  it("TC-014: returns null when runtimeStrategy is undefined (managed runtime equivalent)", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const state = makeStateWithSpecReviewRun({
      specFixerRuns: [{ commitOid: "abc123" }],
    });
    const result = await derivePriorRoundContext!({
      state,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: undefined,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-015: derivePriorRoundContext — 前周 fixer OID あり・mock が files を返す
// ---------------------------------------------------------------------------

describe("TC-015: derivePriorRoundContext — 前周 fixer OID あり・mock が files を返す → findings と changedFiles を返す", () => {
  it("TC-015: returns { findings, changedFiles } with changedFiles matching mock return value", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const expectedFiles = ["specrunner/changes/test-slug/spec.md", "specrunner/changes/test-slug/design.md"];
    const state = makeStateWithSpecReviewRun({
      specReviewFindings: [
        { severity: "high", resolution: "fixable", file: `specrunner/changes/${TEST_SLUG}/spec.md`, title: "Missing requirement", rationale: "test" } satisfies Finding,
      ],
      specFixerRuns: [{ commitOid: "oid1" }],
    });

    const mockStrategy = makeFakeRuntimeStrategy({ files: expectedFiles });
    const result = await derivePriorRoundContext!({
      state,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: mockStrategy,
    });

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("changedFiles");

    // TC-002 / TC-015: changedFiles must come from the mock (machine-derived)
    expect(result!.changedFiles).toEqual(expectedFiles);

    // findings must be derived from state (prior spec-review findings)
    expect(Array.isArray(result!.findings)).toBe(true);
    expect(result!.findings.length).toBeGreaterThan(0);

    // findings should contain severity / resolution / file / title fields
    const f = result!.findings[0]!;
    expect(f).toHaveProperty("severity");
    expect(f).toHaveProperty("resolution");
    expect(f).toHaveProperty("file");
    expect(f).toHaveProperty("title");
  });

  it("TC-015: findings in derivePriorRoundContext result match prior spec-review toolResult findings", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const priorFindings: Finding[] = [
      { severity: "high", resolution: "fixable", file: "specrunner/changes/test-slug/spec.md", title: "Missing req", rationale: "x" },
      { severity: "low", resolution: "fixable", file: "specrunner/changes/test-slug/design.md", title: "Design gap", rationale: "y" },
    ];
    const state = makeStateWithSpecReviewRun({
      specReviewFindings: priorFindings,
      specFixerRuns: [{ commitOid: "oid1" }],
    });

    const result = await derivePriorRoundContext!({
      state,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy({ files: ["a.ts"] }),
    });

    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(2);

    const titles = result!.findings.map((f) => f.title);
    expect(titles).toContain("Missing req");
    expect(titles).toContain("Design gap");
  });
});

// ---------------------------------------------------------------------------
// TC-016: buildPriorRoundContextBlock — 出力が prior-round-context XML タグで囲まれる
// ---------------------------------------------------------------------------

describe("TC-016: buildPriorRoundContextBlock — 出力が prior-round-context XML タグで囲まれる", () => {
  it("TC-016: output starts with <prior-round-context> and ends with </prior-round-context>", () => {
    expect(buildPriorRoundContextBlock).toBeDefined();
    const ctx: PriorRoundContext = {
      findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "Test finding" }],
      changedFiles: ["spec.md"],
    };
    const output = buildPriorRoundContextBlock!(ctx);
    expect(output.trimStart()).toMatch(/^<prior-round-context>/);
    expect(output.trimEnd()).toMatch(/<\/prior-round-context>$/);
  });
});

// ---------------------------------------------------------------------------
// TC-017 (should): buildPriorRoundContextBlock — findings が空配列の場合に「前周指摘なし」を明示する
// ---------------------------------------------------------------------------

describe("TC-017 (should): buildPriorRoundContextBlock — findings が空配列の場合に「前周指摘なし」を明示する", () => {
  it("TC-017: output contains text indicating no prior findings when findings=[]", () => {
    expect(buildPriorRoundContextBlock).toBeDefined();
    const ctx: PriorRoundContext = {
      findings: [],
      changedFiles: ["a.ts"],
    };
    const output = buildPriorRoundContextBlock!(ctx);
    // Should contain some indication of "no prior findings"
    // The exact wording is up to the implementation, but it should be clearly stated
    const hasNoPriorFindingsText =
      output.includes("前周指摘なし") ||
      output.includes("前周の指摘なし") ||
      output.includes("no prior findings") ||
      output.includes("No prior findings") ||
      output.includes("findings: []") ||
      output.includes("指摘なし");
    expect(hasNoPriorFindingsText).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-018 (should): buildPriorRoundContextBlock — changedFiles が空配列の場合に変更なし（machine-derived）を明示する
// ---------------------------------------------------------------------------

describe("TC-018 (should): buildPriorRoundContextBlock — changedFiles が空配列の場合に変更なし（machine-derived）を明示する", () => {
  it("TC-018: output contains text indicating no changed files (machine-derived) when changedFiles=[]", () => {
    expect(buildPriorRoundContextBlock).toBeDefined();
    const ctx: PriorRoundContext = {
      findings: [{ severity: "high", resolution: "fixable", file: "spec.md", title: "Test" }],
      changedFiles: [],
    };
    const output = buildPriorRoundContextBlock!(ctx);
    // Should contain some indication of "no changed files" and machine-derived nature
    const hasNoChangedFilesText =
      output.includes("変更なし") ||
      output.includes("no changed files") ||
      output.includes("No changed files") ||
      output.includes("machine-derived") ||
      output.includes("commit diff");
    expect(hasNoChangedFilesText).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-019 (should): derivePriorRoundContext — changedFiles が空配列でも null でなく注入オブジェクトを返す
// ---------------------------------------------------------------------------

describe("TC-019 (should): derivePriorRoundContext — changedFiles が空配列でも null でなく注入オブジェクトを返す", () => {
  it("TC-019: returns { findings, changedFiles: [] } (not null) when listCommitChangedFiles returns empty files", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const state = makeStateWithSpecReviewRun({
      specFixerRuns: [{ commitOid: "oid1" }],
    });

    const result = await derivePriorRoundContext!({
      state,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy({ files: [] }),
    });

    // Must NOT be null — empty changedFiles is still valid information
    expect(result).not.toBeNull();
    expect(result!.changedFiles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-029 (should): resolvePriorFixerOid — spec-fixer が複数回実行された場合、末尾（最新）の commitOid が参照される
// ---------------------------------------------------------------------------

describe("TC-029 (should): resolvePriorFixerOid — spec-fixer が複数回実行された場合、末尾（最新）の commitOid が参照される", () => {
  it("TC-029: returns 'latest' (last run) not 'old' (first run) when multiple spec-fixer runs exist", () => {
    expect(resolvePriorFixerOid).toBeDefined();
    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [STEP_NAMES.SPEC_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: NOW,
            endedAt: NOW,
            commitOid: "old",
          },
          {
            attempt: 2,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: NOW,
            endedAt: NOW,
            commitOid: "latest",
          },
        ],
      },
    };

    const result = resolvePriorFixerOid!(state);
    expect(result).toBe("latest");
    expect(result).not.toBe("old");
  });
});

// ---------------------------------------------------------------------------
// TC-030 (should): managed runtime 相当（listCommitChangedFiles が unavailable）でも step が正常続行する
// ---------------------------------------------------------------------------

describe("TC-030 (should): managed runtime 相当（listCommitChangedFiles が unavailable）でも step が正常続行する", () => {
  it("TC-030: returns null (not throw) when listCommitChangedFiles returns unavailable", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    const state = makeStateWithSpecReviewRun({
      specFixerRuns: [{ commitOid: "oid1" }],
    });

    const managedFakeStrategy = makeFakeRuntimeStrategy({ kind: "unavailable" });

    let threw = false;
    let result: PriorRoundContext | null = undefined as unknown as PriorRoundContext | null;
    try {
      result = await derivePriorRoundContext!({
        state,
        iteration: 2,
        cwd: "/tmp/worktree",
        runtimeStrategy: managedFakeStrategy,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-031 (should): getLatestJudgeFindings が空配列を返す（前周が全 approve）でも changedFiles があれば注入する
// ---------------------------------------------------------------------------

describe("TC-031 (should): getLatestJudgeFindings が空配列を返す（前周が全 approve）でも changedFiles があれば注入する", () => {
  it("TC-031: returns { findings: [], changedFiles: ['b.ts'] } (not null) when prior spec-review had no findings", async () => {
    expect(derivePriorRoundContext).toBeDefined();
    // Simulate a state where spec-review ran once with empty findings (all approved)
    // but spec-fixer still ran (e.g., minor fixes were made)
    const state: JobState = {
      ...makeBaseState(),
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] as Finding[] }, // empty findings
            },
            startedAt: NOW,
            endedAt: NOW,
          },
        ],
        [STEP_NAMES.SPEC_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: NOW,
            endedAt: NOW,
            commitOid: "oid1",
          },
        ],
      },
    };

    const result = await derivePriorRoundContext!({
      state,
      iteration: 2,
      cwd: "/tmp/worktree",
      runtimeStrategy: makeFakeRuntimeStrategy({ files: ["b.ts"] }),
    });

    expect(result).not.toBeNull();
    expect(result!.findings).toEqual([]);
    expect(result!.changedFiles).toEqual(["b.ts"]);
  });
});
