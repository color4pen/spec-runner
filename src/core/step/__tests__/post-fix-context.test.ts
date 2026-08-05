/**
 * Unit tests for src/core/step/post-fix-context.ts (new module).
 *
 * Source: specrunner/changes/adr-gen-postfix-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * These tests FAIL until post-fix-context.ts is created (RED phase).
 *
 * TC-001: fixer round の changed files と指摘要約が message に含まれる
 *         (function level — derivePostFixContext success path) (must)
 * TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる (must)
 * TC-003: changed files と指摘要約は機械事実のみを真実源にする (must)
 * TC-004: code-review iteration の findings が対応 round に併記される (must)
 * TC-005: code-fixer が一度も走っていない run では block なし
 *         (function level — resolveCodeFixerRounds returns empty → null) (must)
 * TC-006: listCommitChangedFiles port が不在で null 縮退する (must)
 * TC-007: commitOid を持つ round が無い場合に null 縮退する (must)
 * TC-008: listCommitChangedFiles が unavailable / throw する場合に null 縮退する (must)
 * TC-011: resolveCodeFixerRounds — commitOid を持つ run のみ順序保存で返す (must)
 * TC-012: resolveCodeFixerRounds — code-fixer run 無し / commitOid 無しで空配列 (must)
 * TC-013: findFindingsBeforeTimestamp — fixer round 直前の最新 findings-bearing run の findings を射影 (must)
 * TC-014: findFindingsBeforeTimestamp — 該当する findings-bearing run が無い場合に空配列 (must)
 * TC-015: buildPostFixContextBlock — XML タグで囲まれ round ごとに commitOid・changed files・指摘要約を含む (must)
 * TC-016: buildPostFixContextBlock — changedFiles / findings が空配列の場合に明示文言を含む (should)
 * TC-022: 層越え禁止 — post-fix-context.ts が node:child_process / git を直接 import しない (should)
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { JobState, StepRun } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Types for the new module (not yet implemented)
// ---------------------------------------------------------------------------

type PostFixFinding = { severity: string; resolution: string; file: string; title: string };
type PostFixRound = {
  round: number;
  commitOid: string;
  changedFiles: string[];
  findings: PostFixFinding[];
};
type PostFixContext = { rounds: PostFixRound[] };

type ResolveCodeFixerRoundsFn = (state: JobState) => { commitOid: string; endedAt: string }[];
type FindFindingsBeforeTimestampFn = (state: JobState, endedAt: string) => PostFixFinding[];
type BuildPostFixContextBlockFn = (ctx: PostFixContext) => string;
type DerivePostFixContextFn = (params: {
  state: JobState;
  cwd: string;
  runtimeStrategy: unknown;
}) => Promise<PostFixContext | null>;

// ---------------------------------------------------------------------------
// Dynamic module load — post-fix-context.ts does not exist yet (RED phase)
// ---------------------------------------------------------------------------

let resolveCodeFixerRounds: ResolveCodeFixerRoundsFn | undefined;
let findFindingsBeforeTimestamp: FindFindingsBeforeTimestampFn | undefined;
let buildPostFixContextBlock: BuildPostFixContextBlockFn | undefined;
let derivePostFixContext: DerivePostFixContextFn | undefined;

beforeAll(async () => {
  try {
    const mod = await import("../post-fix-context.js") as Record<string, unknown>;
    resolveCodeFixerRounds = mod["resolveCodeFixerRounds"] as ResolveCodeFixerRoundsFn | undefined;
    findFindingsBeforeTimestamp = mod["findFindingsBeforeTimestamp"] as FindFindingsBeforeTimestampFn | undefined;
    buildPostFixContextBlock = mod["buildPostFixContextBlock"] as BuildPostFixContextBlockFn | undefined;
    derivePostFixContext = mod["derivePostFixContext"] as DerivePostFixContextFn | undefined;
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseState(): JobState {
  return {
    version: 2,
    jobId: "post-fix-context-test-job",
    createdAt: T0,
    updatedAt: T0,
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test Request",
      type: "spec-change",
      slug: "test-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: STEP_NAMES.ADR_GEN,
    status: "running",
    branch: "change/test-slug-abc12345",
    history: [],
    error: null,
    steps: {},
  };
}

function makeCodeFixerRun(opts: {
  commitOid?: string;
  endedAt?: string;
  attempt?: number;
} = {}) {
  return {
    attempt: opts.attempt ?? 1,
    sessionId: null,
    outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
    startedAt: T0,
    endedAt: opts.endedAt ?? T1,
    ...(opts.commitOid !== undefined ? { commitOid: opts.commitOid } : {}),
  };
}

function makeCodeReviewRun(opts: {
  findings?: Finding[];
  endedAt?: string;
  attempt?: number;
} = {}): StepRun {
  const findings: Finding[] = opts.findings ?? [
    {
      severity: "high",
      resolution: "fixable",
      file: "src/auth.ts",
      title: "Missing guard",
      rationale: "test",
    },
  ];
  return {
    attempt: opts.attempt ?? 1,
    sessionId: null,
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
    startedAt: T0,
    endedAt: opts.endedAt ?? T0,
  };
}

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
      if (shouldThrow) throw new Error("port error");
      if (kind === "unavailable") {
        return { kind: "unavailable" as const, reason: "test-unavailable" };
      }
      return { kind: "success" as const, files };
    },
  };
}

// ===========================================================================
// TC-011: resolveCodeFixerRounds — commitOid を持つ run のみ順序保存で返す
// ===========================================================================

describe("TC-011: resolveCodeFixerRounds — commitOid を持つ run のみ順序保存で返す", () => {
  it("TC-011: returns only runs with commitOid, in declaration order", () => {
    // TC-011: resolveCodeFixerRounds is exported from post-fix-context.ts
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1, attempt: 1 }),
        makeCodeFixerRun({ /* no commitOid */ endedAt: T2, attempt: 2 }),
        makeCodeFixerRun({ commitOid: "oid3", endedAt: T3, attempt: 3 }),
      ],
    };

    const result = resolveCodeFixerRounds!(state);
    expect(result).toHaveLength(2);
    expect(result[0]!.commitOid).toBe("oid1");
    expect(result[0]!.endedAt).toBe(T1);
    expect(result[1]!.commitOid).toBe("oid3");
    expect(result[1]!.endedAt).toBe(T3);
  });

  it("TC-011: preserves declaration order (first run is first in result)", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "first", endedAt: T1, attempt: 1 }),
        makeCodeFixerRun({ commitOid: "second", endedAt: T2, attempt: 2 }),
      ],
    };

    const result = resolveCodeFixerRounds!(state);
    expect(result).toHaveLength(2);
    expect(result[0]!.commitOid).toBe("first");
    expect(result[1]!.commitOid).toBe("second");
  });

  it("TC-011: each returned item has commitOid and endedAt fields", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1 }),
      ],
    };

    const result = resolveCodeFixerRounds!(state);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("commitOid");
    expect(result[0]).toHaveProperty("endedAt");
    expect(result[0]!.commitOid).toBe("oid1");
    expect(result[0]!.endedAt).toBe(T1);
  });
});

// ===========================================================================
// TC-012: resolveCodeFixerRounds — code-fixer run 無し / commitOid 無しで空配列
// ===========================================================================

describe("TC-012: resolveCodeFixerRounds — code-fixer run 無し / commitOid 無しで空配列", () => {
  it("TC-012: returns empty array when no code-fixer runs exist (steps is empty)", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    // steps is {} — no CODE_FIXER entry at all
    const result = resolveCodeFixerRounds!(state);
    expect(result).toEqual([]);
  });

  it("TC-012: returns empty array when CODE_FIXER steps entry is undefined", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = {};
    const result = resolveCodeFixerRounds!(state);
    expect(result).toEqual([]);
  });

  it("TC-012: returns empty array when all code-fixer runs have no commitOid", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ /* no commitOid */ attempt: 1 }),
        makeCodeFixerRun({ /* no commitOid */ attempt: 2 }),
      ],
    };

    const result = resolveCodeFixerRounds!(state);
    expect(result).toEqual([]);
  });

  it("TC-012: returns empty array when CODE_FIXER array is empty", () => {
    expect(resolveCodeFixerRounds).toBeDefined();

    const state = makeBaseState();
    state.steps = { [STEP_NAMES.CODE_FIXER]: [] };
    const result = resolveCodeFixerRounds!(state);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// TC-013: findFindingsBeforeTimestamp — fixer round 直前の最新 findings-bearing run の findings を射影
// ===========================================================================

describe("TC-013: findFindingsBeforeTimestamp — fixer round 直前の最新 findings-bearing run の findings を射影", () => {
  it("TC-013: returns findings from the run with max endedAt strictly less than t", () => {
    // TC-013: findFindingsBeforeTimestamp is exported from post-fix-context.ts
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    // Two code-review runs: T0 and T1 — both before T2 (fixer endedAt)
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0,
          findings: [
            {
              severity: "low",
              resolution: "fixable",
              file: "src/old.ts",
              title: "Old finding",
              rationale: "x",
            },
          ],
          attempt: 1,
        }),
        makeCodeReviewRun({
          endedAt: T1,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/latest.ts",
              title: "Latest finding",
              rationale: "x",
            },
          ],
          attempt: 2,
        }),
      ],
    };

    // Fixer endedAt = T2 → latest review with endedAt < T2 is T1
    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Latest finding");
    expect(result[0]!.severity).toBe("high");
    expect(result[0]!.file).toBe("src/latest.ts");
    expect(result[0]!.resolution).toBe("fixable");
  });

  it("TC-013: runs with endedAt >= t are excluded", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T1, // T1 < T2 — included candidate
          findings: [
            {
              severity: "medium",
              resolution: "fixable",
              file: "src/a.ts",
              title: "Included",
              rationale: "x",
            },
          ],
          attempt: 1,
        }),
        makeCodeReviewRun({
          endedAt: T3, // T3 >= T2 — excluded
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/b.ts",
              title: "Excluded",
              rationale: "x",
            },
          ],
          attempt: 2,
        }),
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    const titles = result.map((f) => f.title);
    expect(titles).not.toContain("Excluded");
    expect(titles).toContain("Included");
  });

  it("TC-013: searches across all step types (not just code-review)", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    // Conformance step has findings
    state.steps = {
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
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
                  file: "src/core.ts",
                  title: "Conformance finding",
                  rationale: "x",
                },
              ],
            },
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.title).toBe("Conformance finding");
  });

  it("TC-013: projected finding has exactly severity/resolution/file/title fields (no rationale)", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T1,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/a.ts",
              title: "Test finding",
              rationale: "important rationale",
            },
          ],
        }),
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toHaveLength(1);
    const f = result[0]!;
    expect(f).toHaveProperty("severity");
    expect(f).toHaveProperty("resolution");
    expect(f).toHaveProperty("file");
    expect(f).toHaveProperty("title");
    // rationale is NOT in the projected output (projection: severity/resolution/file/title only)
    expect((f as Record<string, unknown>)["rationale"]).toBeUndefined();
  });

  it("TC-013: when multiple runs qualify, picks the one with max endedAt < t", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0, // earliest
          findings: [
            { severity: "low", resolution: "fixable", file: "src/old.ts", title: "T0 finding", rationale: "x" },
          ],
          attempt: 1,
        }),
        makeCodeReviewRun({
          endedAt: T1, // latest before T2
          findings: [
            { severity: "high", resolution: "fixable", file: "src/t1.ts", title: "T1 finding", rationale: "x" },
          ],
          attempt: 2,
        }),
      ],
    };

    // t = T2 → both T0 and T1 qualify, but T1 is the max endedAt < T2
    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result.map((f) => f.title)).toContain("T1 finding");
    // Should NOT include T0 findings (T1 is the max)
    expect(result.map((f) => f.title)).not.toContain("T0 finding");
  });
});

// ===========================================================================
// TC-014: findFindingsBeforeTimestamp — 該当する findings-bearing run が無い場合に空配列
// ===========================================================================

describe("TC-014: findFindingsBeforeTimestamp — 該当する findings-bearing run が無い場合に空配列", () => {
  it("TC-014: returns empty array when no steps exist at all", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    // steps is {} — nothing
    const result = findFindingsBeforeTimestamp!(state, T1);
    expect(result).toEqual([]);
  });

  it("TC-014: returns empty array when all findings-bearing runs are after t", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({ endedAt: T3, attempt: 1 }), // T3 > T2
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toEqual([]);
  });

  it("TC-014: returns empty array when runs exist but toolResult has no findings", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true /* no findings field */ },
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toEqual([]);
  });

  it("TC-014: returns empty array when runs exist but toolResult is null", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ endedAt: T1 }), // fixer: toolResult = null, no findings
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toEqual([]);
  });

  it("TC-014: returns empty array when findings array in toolResult is empty", () => {
    expect(findFindingsBeforeTimestamp).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] }, // empty findings
          },
          startedAt: T0,
          endedAt: T1,
        },
      ],
    };

    const result = findFindingsBeforeTimestamp!(state, T2);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// TC-015: buildPostFixContextBlock — XML タグで囲まれ round ごとに commitOid・changed files・指摘要約を含む
// ===========================================================================

describe("TC-015: buildPostFixContextBlock — XML タグで囲まれ round ごとに commitOid・changed files・指摘要約を含む", () => {
  it("TC-015: output is enclosed in <post-fix-context>...</post-fix-context> XML tags", () => {
    // TC-015: buildPostFixContextBlock is exported from post-fix-context.ts
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "abc123",
          changedFiles: ["src/auth.ts"],
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/auth.ts",
              title: "Missing guard",
            },
          ],
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);
    expect(output.trimStart()).toMatch(/^<post-fix-context>/);
    expect(output.trimEnd()).toMatch(/<\/post-fix-context>$/);
  });

  it("TC-015: output contains round number, commitOid, changed files, and findings for a single round", () => {
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "deadbeef",
          changedFiles: ["src/auth.ts", "src/utils.ts"],
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/auth.ts",
              title: "Missing null guard",
            },
          ],
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);

    // Round number must appear
    expect(output).toContain("1");
    // commitOid must appear
    expect(output).toContain("deadbeef");
    // Changed files must appear
    expect(output).toContain("src/auth.ts");
    expect(output).toContain("src/utils.ts");
    // Finding details must appear
    expect(output).toContain("Missing null guard");
    expect(output).toContain("high");
  });

  it("TC-015: output contains all rounds when multiple rounds are present", () => {
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "oid1",
          changedFiles: ["src/a.ts"],
          findings: [
            {
              severity: "medium",
              resolution: "fixable",
              file: "src/a.ts",
              title: "Finding A",
            },
          ],
        },
        {
          round: 2,
          commitOid: "oid2",
          changedFiles: ["src/b.ts"],
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/b.ts",
              title: "Finding B",
            },
          ],
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);

    // Both rounds must be present
    expect(output).toContain("oid1");
    expect(output).toContain("oid2");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("Finding A");
    expect(output).toContain("Finding B");
  });

  it("TC-015: findings severity, resolution, file, and title all appear in block", () => {
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "abc",
          changedFiles: [],
          findings: [
            {
              severity: "critical",
              resolution: "manual",
              file: "src/security.ts",
              title: "Security vulnerability",
            },
          ],
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);
    expect(output).toContain("critical");
    expect(output).toContain("manual");
    expect(output).toContain("src/security.ts");
    expect(output).toContain("Security vulnerability");
  });
});

// ===========================================================================
// TC-016: buildPostFixContextBlock — changedFiles / findings が空配列の場合に明示文言を含む (should)
// ===========================================================================

describe("TC-016: buildPostFixContextBlock — changedFiles / findings が空配列の場合に明示文言を含む (should)", () => {
  it("TC-016: output contains explicit text indicating no changed files when changedFiles is empty", () => {
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "oid1",
          changedFiles: [], // empty
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/auth.ts",
              title: "Test finding",
            },
          ],
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);

    // Must contain some form of "no changed files" indication
    const hasNoChangedFilesText =
      output.includes("変更 file なし") ||
      output.includes("変更なし") ||
      output.includes("no changed files") ||
      output.includes("No changed files") ||
      output.includes("machine-derived") ||
      output.includes("commit diff");
    expect(hasNoChangedFilesText).toBe(true);
  });

  it("TC-016: output contains explicit text indicating no review findings when findings is empty", () => {
    expect(buildPostFixContextBlock).toBeDefined();

    const ctx: PostFixContext = {
      rounds: [
        {
          round: 1,
          commitOid: "oid1",
          changedFiles: ["src/auth.ts"],
          findings: [], // empty
        },
      ],
    };

    const output = buildPostFixContextBlock!(ctx);

    // Must contain some form of "no review findings" indication
    const hasNoFindingsText =
      output.includes("対応 review 指摘なし") ||
      output.includes("指摘なし") ||
      output.includes("no review findings") ||
      output.includes("No review findings") ||
      output.includes("no findings") ||
      output.includes("No findings");
    expect(hasNoFindingsText).toBe(true);
  });
});

// ===========================================================================
// TC-001 (function level): derivePostFixContext — 成功時に changed files と findings を含む PostFixContext を返す
// ===========================================================================

describe("TC-001 (derivePostFixContext): fixer round の changed files と指摘要約が正しく導出される", () => {
  it("TC-001: derivePostFixContext returns PostFixContext with changedFiles and findings for a single round", async () => {
    // TC-001: derivePostFixContext is exported from post-fix-context.ts
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/auth.ts",
              title: "Missing guard",
              rationale: "x",
            },
          ],
        }),
      ],
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "abc123", endedAt: T1 }),
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["src/auth.ts", "src/login.ts"] });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    expect(result!.rounds).toHaveLength(1);
    const round = result!.rounds[0]!;
    expect(round.commitOid).toBe("abc123");
    expect(round.round).toBe(1);
    expect(round.changedFiles).toContain("src/auth.ts");
    expect(round.changedFiles).toContain("src/login.ts");
    expect(round.findings).toHaveLength(1);
    expect(round.findings[0]!.title).toBe("Missing guard");
    expect(round.findings[0]!.severity).toBe("high");
  });

  it("TC-001: round has 1-origin round number", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1 }),
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: [] });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    expect(result!.rounds[0]!.round).toBe(1);
  });
});

// ===========================================================================
// TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる
// ===========================================================================

describe("TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる", () => {
  it("TC-002: derivePostFixContext returns all rounds, not just the latest", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/a.ts",
              title: "Round1 finding",
              rationale: "x",
            },
          ],
          attempt: 1,
        }),
        makeCodeReviewRun({
          endedAt: T2,
          findings: [
            {
              severity: "medium",
              resolution: "fixable",
              file: "src/b.ts",
              title: "Round2 finding",
              rationale: "x",
            },
          ],
          attempt: 2,
        }),
      ],
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1, attempt: 1 }),
        makeCodeFixerRun({ commitOid: "oid2", endedAt: T3, attempt: 2 }),
      ],
    };

    const fakeStrategy = {
      listCommitChangedFiles: async (oid: string, _cwd: string) => ({
        kind: "success" as const,
        files: oid === "oid1" ? ["src/a.ts"] : ["src/b.ts"],
      }),
    };

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    // ALL rounds — not just the latest (oid2)
    expect(result!.rounds).toHaveLength(2);
    const oids = result!.rounds.map((r) => r.commitOid);
    expect(oids).toContain("oid1");
    expect(oids).toContain("oid2");

    // Round numbers are 1-origin and ordered
    const roundNumbers = result!.rounds.map((r) => r.round);
    expect(roundNumbers).toContain(1);
    expect(roundNumbers).toContain(2);
  });
});

// ===========================================================================
// TC-003: changed files と指摘要約は機械事実のみを真実源にする
// ===========================================================================

describe("TC-003: changed files と指摘要約は機械事実のみを真実源にする", () => {
  it("TC-003: changedFiles come exclusively from listCommitChangedFiles mock (sentinel check)", async () => {
    expect(derivePostFixContext).toBeDefined();

    // Sentinel files — these unique strings can ONLY come from listCommitChangedFiles mock
    const SENTINEL_FILES = ["__SENTINEL_FILE_A__", "__SENTINEL_FILE_B__"];

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1 }),
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: SENTINEL_FILES });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    // changedFiles must EXACTLY match the mock return — sentinel proves machine derivation
    expect(result!.rounds[0]!.changedFiles).toEqual(SENTINEL_FILES);
  });

  it("TC-003: findings come from state (code-review toolResult), not from fixer toolResult", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/state-finding.ts",
              title: "State finding title",
              rationale: "x",
            },
          ],
        }),
      ],
      [STEP_NAMES.CODE_FIXER]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: null, // fixer has no findings (never self-reports)
          },
          startedAt: T0,
          endedAt: T1,
          commitOid: "oid1",
        },
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["src/fix.ts"] });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    // Findings come from code-review state (machine fact), not from fixer's self-report
    expect(result!.rounds[0]!.findings.map((f) => f.title)).toContain("State finding title");
  });
});

// ===========================================================================
// TC-004: code-review iteration の findings が対応 round に併記される
// ===========================================================================

describe("TC-004: code-review iteration の findings が対応 round に併記される", () => {
  it("TC-004: each fixer round gets findings from the latest findings-bearing run with endedAt < round.endedAt", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    // code-review round 1 at T0 → code-fixer round 1 at T1
    // code-review round 2 at T2 → code-fixer round 2 at T3
    state.steps = {
      [STEP_NAMES.CODE_REVIEW]: [
        makeCodeReviewRun({
          endedAt: T0,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/a.ts",
              title: "First review finding",
              rationale: "x",
            },
          ],
          attempt: 1,
        }),
        makeCodeReviewRun({
          endedAt: T2,
          findings: [
            {
              severity: "medium",
              resolution: "fixable",
              file: "src/b.ts",
              title: "Second review finding",
              rationale: "x",
            },
          ],
          attempt: 2,
        }),
      ],
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1, attempt: 1 }),
        makeCodeFixerRun({ commitOid: "oid2", endedAt: T3, attempt: 2 }),
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy({ files: ["x.ts"] });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: fakeStrategy,
    });

    expect(result).not.toBeNull();
    expect(result!.rounds).toHaveLength(2);

    // Round 1 (fixer endedAt=T1) → should have findings from T0 review (latest before T1)
    const round1 = result!.rounds.find((r) => r.commitOid === "oid1");
    expect(round1).toBeDefined();
    expect(round1!.findings.map((f) => f.title)).toContain("First review finding");
    expect(round1!.findings.map((f) => f.title)).not.toContain("Second review finding");

    // Round 2 (fixer endedAt=T3) → should have findings from T2 review (latest before T3)
    const round2 = result!.rounds.find((r) => r.commitOid === "oid2");
    expect(round2).toBeDefined();
    expect(round2!.findings.map((f) => f.title)).toContain("Second review finding");
  });
});

// ===========================================================================
// TC-005 (function level): code-fixer が走っていない場合に null を返す
// ===========================================================================

describe("TC-005 (derivePostFixContext function level): code-fixer が走っていない run では null を返す", () => {
  it("TC-005: derivePostFixContext returns null when no code-fixer runs exist", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    // No code-fixer runs at all
    const fakeStrategy = makeFakeRuntimeStrategy();

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({ state, cwd: "/tmp/worktree", runtimeStrategy: fakeStrategy });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// TC-006: listCommitChangedFiles port が不在で null 縮退する
// ===========================================================================

describe("TC-006: listCommitChangedFiles port が不在で null 縮退する", () => {
  it("TC-006: returns null when runtimeStrategy is undefined", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1" })],
    };

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: undefined,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-006: returns null when runtimeStrategy has no listCommitChangedFiles method (managed runtime equivalent)", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1" })],
    };

    // Strategy without listCommitChangedFiles (e.g. managed runtime)
    const strategyWithoutPort = {
      validateStepOutputs: async () => [],
      // No listCommitChangedFiles
    };

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: strategyWithoutPort,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-006: derivePostFixContext does not throw in any port-absent path", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1" })],
    };

    // All null/undefined runtimeStrategy variants must not throw
    for (const strategy of [undefined, null, {}, { otherMethod: () => {} }]) {
      let threw = false;
      try {
        await derivePostFixContext!({
          state,
          cwd: "/tmp/worktree",
          runtimeStrategy: strategy,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    }
  });
});

// ===========================================================================
// TC-007: commitOid を持つ round が無い場合に null 縮退する
// ===========================================================================

describe("TC-007: commitOid を持つ round が無い場合に null 縮退する", () => {
  it("TC-007: returns null when all code-fixer runs have no commitOid", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ /* no commitOid */ attempt: 1 }),
        makeCodeFixerRun({ /* no commitOid */ attempt: 2 }),
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy();

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: fakeStrategy,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-007: does not throw when code-fixer runs exist but have no commitOid", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ attempt: 1 }), // no commitOid
      ],
    };

    const fakeStrategy = makeFakeRuntimeStrategy();

    await expect(
      derivePostFixContext!({ state, cwd: "/tmp/worktree", runtimeStrategy: fakeStrategy }),
    ).resolves.toBeNull();
  });
});

// ===========================================================================
// TC-008: listCommitChangedFiles が unavailable / port が throw する場合に null 縮退する
// ===========================================================================

describe("TC-008: listCommitChangedFiles が unavailable / port が throw する場合に null 縮退する", () => {
  it("TC-008: returns null when listCommitChangedFiles returns { kind: 'unavailable' }", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1" })],
    };

    const unavailableStrategy = makeFakeRuntimeStrategy({ kind: "unavailable" });

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: unavailableStrategy,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-008: returns null and does NOT throw when listCommitChangedFiles throws", async () => {
    expect(derivePostFixContext).toBeDefined();

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1" })],
    };

    const throwingStrategy = makeFakeRuntimeStrategy({ shouldThrow: true });

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: throwingStrategy,
      });
    } catch {
      threw = true;
    }

    // derivePostFixContext MUST NOT throw (all-or-nothing null degrade)
    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it("TC-008: null degrade is all-or-nothing — one port error nulls out all rounds", async () => {
    expect(derivePostFixContext).toBeDefined();

    // Two rounds, but the second one throws — whole result is null (D5: all-or-nothing)
    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [
        makeCodeFixerRun({ commitOid: "oid1", endedAt: T1, attempt: 1 }),
        makeCodeFixerRun({ commitOid: "oid2", endedAt: T3, attempt: 2 }),
      ],
    };

    let callCount = 0;
    const partialThrowStrategy = {
      listCommitChangedFiles: async (_oid: string, _cwd: string) => {
        callCount++;
        if (callCount >= 2) throw new Error("second call fails");
        return { kind: "success" as const, files: ["src/a.ts"] };
      },
    };

    let threw = false;
    let result: PostFixContext | null | undefined;
    try {
      result = await derivePostFixContext!({
        state,
        cwd: "/tmp/worktree",
        runtimeStrategy: partialThrowStrategy,
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // All-or-nothing: if any round fails, entire result is null
    expect(result).toBeNull();
  });
});

// ===========================================================================
// TC-022 (should): 層越え禁止 — post-fix-context.ts が node:child_process / git を直接 import しない
// ===========================================================================

describe("TC-022 (should): 層越え禁止 — post-fix-context.ts の I/O は runtimeStrategy port 背後のみ", () => {
  it("TC-022: derivePostFixContext result comes exclusively from runtimeStrategy port (sentinel behavioral check)", async () => {
    // Behavioral proof: I/O is routed through runtimeStrategy.listCommitChangedFiles exclusively.
    // If post-fix-context.ts directly called git subprocess, the result would not match
    // the mock's sentinel values.
    expect(derivePostFixContext).toBeDefined();

    const SENTINEL = ["__LAYER_BOUNDARY_SENTINEL__"];

    const state = makeBaseState();
    state.steps = {
      [STEP_NAMES.CODE_FIXER]: [makeCodeFixerRun({ commitOid: "oid1", endedAt: T1 })],
    };

    const mockStrategy = makeFakeRuntimeStrategy({ files: SENTINEL });

    const result = await derivePostFixContext!({
      state,
      cwd: "/tmp/worktree",
      runtimeStrategy: mockStrategy,
    });

    expect(result).not.toBeNull();
    // changedFiles must EXACTLY match the mock — proving I/O goes through port only
    expect(result!.rounds[0]!.changedFiles).toEqual(SENTINEL);
  });
});
