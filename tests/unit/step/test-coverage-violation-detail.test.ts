/**
 * Unit tests for test-coverage violation detail feature.
 *
 * Covers the following test cases (TC IDs are frozen):
 *   TC-001: missing と assertionless の双方を保持する
 *   TC-002: halt メッセージに欠落 TC-ID が載る
 *   TC-003: missing と assertionless で異なる修復指示を ID 明示で出す
 *   TC-004: 違反 → 修復 → 再検証 pass の経路が成立する
 *   TC-005: 修復試行上限まで解消しない違反は halt へ合流し ID を伴う
 *   TC-006: missing のみのケースで coverage.missingTcIds が評価器の結果と一致する
 *   TC-007: assertionless のみのケースで coverage.assertionlessTcIds が評価器の結果と一致する
 *   TC-008: missing と assertionless 混在ケースで detail は union・coverage は区別を維持する
 *   TC-009: coverage 未設定の test-coverage violation で halt が "see file" fall back になる
 *   TC-010: test-materialize の test-coverage 契約が follow-up policy を宣言する (→ also updated in TC-TMB-04)
 *   TC-011: step-context-builder が test-materialize の follow-up 契約から outputVerification を構築する
 *   TC-012: managed runtime の test-coverage 分岐が best-effort skip のまま
 *   TC-013: bun run typecheck && bun run test が green (manual — skipped here)
 *   TC-014: test-coverage violation の両カテゴリ空で follow-up prompt が fall back を出す (should)
 *   TC-015: halt メッセージで missing のみの場合 assertionless 節が省かれる (should)
 *   TC-016: follow-up prompt で assertionless のみの場合 missing 修復指示が省かれる (could)
 *
 * These tests are intentionally RED before implementation is complete.
 * The implementer will make them GREEN by:
 *   T-01: OutputViolation に coverage 構造化フィールドを追加
 *   T-02: local runtime の test-coverage 検出で coverage を格納
 *   T-03: halt メッセージに test-coverage の欠落 TC-ID を描画
 *   T-04: follow-up prompt に test-coverage 節を追加
 *   T-05: test-materialize の test-coverage 契約を follow-up policy に変更
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { makeOutputGateHalt } from "../../../src/core/step/step-halt.js";
import { buildOutputFollowUpPrompt } from "../../../src/core/step/output-verify.js";
import { TestMaterializeStep } from "../../../src/core/step/test-materialize.js";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import { buildStepContext } from "../../../src/core/step/step-context-builder.js";
import type { OutputContract, OutputViolation } from "../../../src/core/port/output-contract.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import type { PipelineDeps } from "../../../src/core/types.js";

// ---------------------------------------------------------------------------
// Helper types — define the coverage structure expected after T-01
// ---------------------------------------------------------------------------

/**
 * The `coverage` field that T-01 will add to OutputViolation.
 * Used in type assertions throughout these tests.
 */
interface CoverageDetail {
  missingTcIds: string[];
  assertionlessTcIds: string[];
}

/** OutputViolation augmented with the coverage field (post T-01). */
interface OutputViolationWithCoverage extends OutputViolation {
  coverage?: CoverageDetail;
}

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-violation-detail-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "test-materialize",
    status: "running",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalStepDeps(slug = "test-slug"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "spec-change",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "Add feature X",
      adr: false,
    },
    slug,
  };
}

function makeLocalRuntime(): LocalRuntime {
  return new LocalRuntime({
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      verifyPath: vi.fn(),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "",
        mergeable: "MERGEABLE",
      }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConstructorParameters<typeof LocalRuntime>[0]["githubClient"],
    githubToken: "token",
    spawnFn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  });
}

/** test-cases.md content with a single must TC */
const TEST_CASES_SINGLE_MUST = `## TC-001: Feature works
- **Priority**: must
- Summary: ensures feature X works
`;

/** test-cases.md content with TC-001 (missing) and TC-002 (assertionless candidate) */
const TEST_CASES_TWO_MUST = `## TC-001: Missing TC
- **Priority**: must
- Summary: this TC will be missing from test files

## TC-002: Assertionless TC
- **Priority**: must
- Summary: this TC will appear in test files without an assertion
`;

/** test-cases.md content with TC-001 (missing only) */
const TEST_CASES_MISSING_ONLY = `## TC-001: Missing TC
- **Priority**: must
- Summary: this TC will be missing from test files
`;

/** test-cases.md content with TC-002 (assertionless only — will be in test file without assertion) */
const TEST_CASES_ASSERTIONLESS_ONLY = `## TC-002: Assertionless TC
- **Priority**: must
- Summary: this TC appears in test files but has no assertion
`;

/** test-cases.md with TC-001 missing AND TC-002 assertionless */
const TEST_CASES_MIXED = `## TC-001: Missing TC
- **Priority**: must
- Summary: this TC will be missing from test files

## TC-002: Assertionless TC
- **Priority**: must
- Summary: this TC appears in test files but has no assertion
`;

const TC_REL_PATH = "specrunner/changes/test-slug/test-cases.md";

async function writeTestCasesMd(content: string): Promise<void> {
  const absPath = path.join(tempDir, TC_REL_PATH);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, "utf-8");
}

async function writeTestFile(filename: string, content: string): Promise<void> {
  const testsDir = path.join(tempDir, "tests");
  await fs.mkdir(testsDir, { recursive: true });
  await fs.writeFile(path.join(testsDir, filename), content, "utf-8");
}

// ---------------------------------------------------------------------------
// TC-001: missing と assertionless の双方を保持する
// ---------------------------------------------------------------------------

describe("TC-001: OutputViolation.coverage preserves both missing and assertionless TC-IDs", () => {
  it("TC-001: violation.coverage.missingTcIds and assertionlessTcIds are both populated when both categories exist", async () => {
    // GIVEN: test-cases.md with TC-001 and TC-002 (both must)
    //        TC-001 is absent from test files (missing)
    //        TC-002 appears in test file without assertion (assertionless)
    await writeTestCasesMd(TEST_CASES_MIXED);
    await writeTestFile(
      "mixed.test.ts",
      // TC-002 present but no assertion (comment only)
      "// TC-002 placeholder — no expect() here\n",
    );

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TC_REL_PATH, policy: "follow-up" },
    ];

    // WHEN: validateStepOutputs is called
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);

    // THEN: violation exists with coverage field distinguishing missing from assertionless
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0] as OutputViolationWithCoverage;
    // After T-01 + T-02: coverage field must distinguish missing (TC-001) from assertionless (TC-002)
    expect(v.coverage).toBeDefined();
    expect(v.coverage?.missingTcIds).toContain("TC-001");
    expect(v.coverage?.assertionlessTcIds).toContain("TC-002");
    // TC-001 must NOT appear in assertionlessTcIds, TC-002 must NOT appear in missingTcIds
    expect(v.coverage?.assertionlessTcIds).not.toContain("TC-001");
    expect(v.coverage?.missingTcIds).not.toContain("TC-002");
  });
});

// ---------------------------------------------------------------------------
// TC-002: halt メッセージに欠落 TC-ID が載る
// ---------------------------------------------------------------------------

describe("TC-002: makeOutputGateHalt renders test-coverage violation with TC-IDs", () => {
  it("TC-002: halt message and hint contain missing and assertionless TC-IDs from test-coverage violation", () => {
    // GIVEN: test-coverage violation with coverage.missingTcIds and assertionlessTcIds
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "halt" as const,
      detail: ["TC-064", "TC-065", "TC-003"],
      coverage: {
        missingTcIds: ["TC-064", "TC-065"],
        assertionlessTcIds: ["TC-003"],
      },
    } as unknown as OutputViolation;

    // WHEN: makeOutputGateHalt is called
    const halt = makeOutputGateHalt([violation], "test-materialize", "feat/test-slug");

    // THEN: error.message and error.hint both contain TC-064, TC-065, TC-003
    expect(halt.error.message).toContain("TC-064");
    expect(halt.error.message).toContain("TC-065");
    expect(halt.error.message).toContain("TC-003");
    expect(halt.error.hint).toContain("TC-064");
    expect(halt.error.hint).toContain("TC-065");
    expect(halt.error.hint).toContain("TC-003");
  });

  it("TC-002: halt message distinguishes 'missing TCs' from 'assertionless TCs'", () => {
    // GIVEN: test-coverage violation with both categories
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "halt" as const,
      detail: ["TC-064", "TC-003"],
      coverage: {
        missingTcIds: ["TC-064"],
        assertionlessTcIds: ["TC-003"],
      },
    } as unknown as OutputViolation;

    // WHEN
    const halt = makeOutputGateHalt([violation], "test-materialize", "feat/test-slug");

    // THEN: the rendered output distinguishes missing from assertionless
    const rendered = halt.error.message + halt.error.hint;
    // After T-03: "missing" and "assertionless" are distinct sections in the rendering
    expect(rendered).toMatch(/missing/i);
    expect(rendered).toMatch(/assertionless/i);
  });
});

// ---------------------------------------------------------------------------
// TC-003: missing と assertionless で異なる修復指示を ID 明示で出す
// ---------------------------------------------------------------------------

describe("TC-003: buildOutputFollowUpPrompt generates distinct repair instructions for missing and assertionless TCs", () => {
  it("TC-003: prompt contains 'write test' instruction for missing TCs with ID listed", () => {
    // GIVEN: test-coverage violation with missing TC-064
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-064"],
      coverage: {
        missingTcIds: ["TC-064"],
        assertionlessTcIds: [],
      },
    } as unknown as OutputViolation;

    // WHEN: buildOutputFollowUpPrompt is called
    const prompt = buildOutputFollowUpPrompt([violation]);

    // THEN: TC-064 is listed in the "write test" repair instruction
    expect(prompt).toContain("TC-064");
    // The prompt should instruct writing tests for missing TCs
    expect(prompt.toLowerCase()).toMatch(/write.*test|テスト.*書|test.*code/i);
  });

  it("TC-003: prompt contains 'add assertion' instruction for assertionless TCs with ID listed", () => {
    // GIVEN: test-coverage violation with assertionless TC-003
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-003"],
      coverage: {
        missingTcIds: [],
        assertionlessTcIds: ["TC-003"],
      },
    } as unknown as OutputViolation;

    // WHEN
    const prompt = buildOutputFollowUpPrompt([violation]);

    // THEN: TC-003 is listed in the "add assertion" repair instruction
    expect(prompt).toContain("TC-003");
    // The prompt should instruct adding assertions for assertionless TCs
    expect(prompt.toLowerCase()).toMatch(/assert|assertion/i);
  });

  it("TC-003: missing and assertionless repair instructions are distinct in the prompt", () => {
    // GIVEN: test-coverage violation with both TC-064 (missing) and TC-003 (assertionless)
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-064", "TC-003"],
      coverage: {
        missingTcIds: ["TC-064"],
        assertionlessTcIds: ["TC-003"],
      },
    } as unknown as OutputViolation;

    // WHEN
    const prompt = buildOutputFollowUpPrompt([violation]);

    // THEN: both TC-IDs appear, with distinct repair instructions
    expect(prompt).toContain("TC-064");
    expect(prompt).toContain("TC-003");
    // After T-04: the two categories should have different instructions
    // Missing TCs → "write test and embed TC-ID"; assertionless → "add assertion"
    // Both must appear in the prompt
    const hasWriteInstruction = prompt.toLowerCase().match(/write.*test|テスト.*書|test.*code/i) !== null;
    const hasAssertionInstruction = prompt.toLowerCase().match(/assert/i) !== null;
    expect(hasWriteInstruction).toBe(true);
    expect(hasAssertionInstruction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 違反 → 修復 → 再検証 pass の経路が成立する
// ---------------------------------------------------------------------------

describe("TC-004: test-coverage follow-up violation → repair (write test) → re-detect pass", () => {
  it("TC-004: follow-up contract from TestMaterializeStep detects violation then passes after repair", async () => {
    // GIVEN: TestMaterializeStep declares test-coverage as follow-up (after T-05)
    const state = makeMinimalState();
    const deps = makeMinimalStepDeps("test-slug");
    const contracts = TestMaterializeStep.outputContracts!(state, deps);

    // After T-05: test-coverage contract should have policy "follow-up"
    const followUpContracts = contracts.filter((c) => c.policy === "follow-up");
    // This assertion fails until T-05 is done (currently policy is "halt")
    expect(followUpContracts, "test-coverage contract should be follow-up after T-05").toHaveLength(1);

    const tcContract = followUpContracts[0]!;

    // Write test-cases.md
    const absTestCasesPath = path.join(tempDir, tcContract.path);
    await fs.mkdir(path.dirname(absTestCasesPath), { recursive: true });
    await fs.writeFile(absTestCasesPath, TEST_CASES_SINGLE_MUST, "utf-8");

    const runtime = makeLocalRuntime();

    // WHEN: initial detect — TC-001 is missing
    const result1 = await runtime.validateStepOutputs(followUpContracts, tempDir, null);
    expect(result1.violations, "Expected violation before repair").toHaveLength(1);
    expect(result1.violations[0]?.policy).toBe("follow-up");

    // Repair: write test file covering TC-001 with an assertion
    await writeTestFile(
      "feature.test.ts",
      'it("TC-001: feature works", () => { expect(true).toBe(true); });',
    );

    // THEN: re-detect — 0 violations after repair
    const result2 = await runtime.validateStepOutputs(followUpContracts, tempDir, null);
    expect(result2.violations, "Expected 0 violations after repair").toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: 修復試行上限まで解消しない違反は halt へ合流し ID を伴う
// ---------------------------------------------------------------------------

describe("TC-005: exhausted follow-up violations halt with TC-IDs in message", () => {
  it("TC-005: makeOutputGateHalt with remaining follow-up test-coverage violation includes missing TC-IDs", () => {
    // GIVEN: a follow-up test-coverage violation that wasn't repaired (exhausted attempts)
    //        with coverage.missingTcIds = ["TC-064", "TC-065"]
    const remainingViolation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-064", "TC-065"],
      coverage: {
        missingTcIds: ["TC-064", "TC-065"],
        assertionlessTcIds: [],
      },
    } as unknown as OutputViolation;

    // WHEN: executor merges remaining follow-up violations into halt (makeOutputGateHalt)
    const halt = makeOutputGateHalt([remainingViolation], "test-materialize", "feat/test-slug");

    // THEN: halt message contains TC-064 and TC-065
    // (executor passes allViolations = halt + followUp to makeOutputGateHalt)
    expect(halt.error.message).toContain("TC-064");
    expect(halt.error.message).toContain("TC-065");
    expect(halt.error.hint).toContain("TC-064");
    expect(halt.error.hint).toContain("TC-065");
  });

  it("TC-005: halt kind is 'failed' for exhausted violations", () => {
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-001"],
      coverage: { missingTcIds: ["TC-001"], assertionlessTcIds: [] },
    } as unknown as OutputViolation;

    const halt = makeOutputGateHalt([violation], "test-materialize", "feat/test-slug");
    expect(halt.kind).toBe("failed");
    expect(halt.error.code).toBe("STEP_OUTPUT_MISSING");
  });
});

// ---------------------------------------------------------------------------
// TC-006: missing のみのケースで coverage.missingTcIds が評価器の結果と一致する
// ---------------------------------------------------------------------------

describe("TC-006: local runtime — missing-only coverage matches evaluator result", () => {
  it("TC-006: violation.coverage.missingTcIds=['TC-001'], assertionlessTcIds=[] when only TC-001 is missing", async () => {
    // GIVEN: evaluateTestCoverage returns missingTcIds=["TC-001"], assertionlessTcIds=[]
    await writeTestCasesMd(TEST_CASES_MISSING_ONLY);
    // No test file written → TC-001 is missing

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TC_REL_PATH, policy: "follow-up" },
    ];

    // WHEN: validateStepOutputs is called
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);

    // THEN: violation exists with coverage reflecting the evaluator result
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0] as OutputViolationWithCoverage;
    // After T-01 + T-02
    expect(v.coverage).toBeDefined();
    expect(v.coverage?.missingTcIds).toEqual(["TC-001"]);
    expect(v.coverage?.assertionlessTcIds).toEqual([]);
    // detail still contains TC-001 (union of missing + assertionless)
    expect(v.detail).toContain("TC-001");
  });
});

// ---------------------------------------------------------------------------
// TC-007: assertionless のみのケースで coverage.assertionlessTcIds が評価器の結果と一致する
// ---------------------------------------------------------------------------

describe("TC-007: local runtime — assertionless-only coverage matches evaluator result", () => {
  it("TC-007: violation.coverage.assertionlessTcIds=['TC-002'], missingTcIds=[] when TC-002 has no assertion", async () => {
    // GIVEN: evaluateTestCoverage returns missingTcIds=[], assertionlessTcIds=["TC-002"]
    await writeTestCasesMd(TEST_CASES_ASSERTIONLESS_ONLY);
    // TC-002 present in test file but WITHOUT an assertion
    await writeTestFile(
      "assertionless.test.ts",
      // TC-002 present as comment/identifier only, no expect() call
      "// TC-002 placeholder\ndescribe('TC-002', () => { it('placeholder', () => {}); });\n",
    );

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TC_REL_PATH, policy: "follow-up" },
    ];

    // WHEN
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);

    // THEN: violation exists with coverage.assertionlessTcIds=["TC-002"], missingTcIds=[]
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0] as OutputViolationWithCoverage;
    // After T-01 + T-02
    expect(v.coverage).toBeDefined();
    expect(v.coverage?.assertionlessTcIds).toContain("TC-002");
    expect(v.coverage?.missingTcIds).toEqual([]);
    // detail contains TC-002
    expect(v.detail).toContain("TC-002");
  });
});

// ---------------------------------------------------------------------------
// TC-008: missing と assertionless 混在ケースで detail は union・coverage は区別を維持する
// ---------------------------------------------------------------------------

describe("TC-008: local runtime — mixed case detail is union, coverage maintains separation", () => {
  it("TC-008: coverage.missingTcIds=['TC-001'], assertionlessTcIds=['TC-002'], detail is their union", async () => {
    // GIVEN: evaluateTestCoverage returns missingTcIds=["TC-001"], assertionlessTcIds=["TC-002"]
    await writeTestCasesMd(TEST_CASES_MIXED);
    // TC-001 is missing from test files
    // TC-002 is in test file without assertion
    await writeTestFile(
      "mixed.test.ts",
      // TC-002 present but no assertion
      "// TC-002 placeholder — no expect() call\n",
    );

    const runtime = makeLocalRuntime();
    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TC_REL_PATH, policy: "follow-up" },
    ];

    // WHEN
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);

    // THEN: coverage distinguishes categories, detail is union
    expect(result.violations).toHaveLength(1);
    const v = result.violations[0] as OutputViolationWithCoverage;
    // After T-01 + T-02
    expect(v.coverage).toBeDefined();
    expect(v.coverage?.missingTcIds).toContain("TC-001");
    expect(v.coverage?.assertionlessTcIds).toContain("TC-002");
    // detail is the union (order may vary, so check each element)
    expect(v.detail).toContain("TC-001");
    expect(v.detail).toContain("TC-002");
    // Separation: TC-001 is missing (not assertionless), TC-002 is assertionless (not missing)
    expect(v.coverage?.missingTcIds).not.toContain("TC-002");
    expect(v.coverage?.assertionlessTcIds).not.toContain("TC-001");
  });
});

// ---------------------------------------------------------------------------
// TC-009: coverage 未設定の test-coverage violation で halt が "see file" fall back になる
// ---------------------------------------------------------------------------

describe("TC-009: makeOutputGateHalt with undefined coverage falls back to 'see file'", () => {
  it("TC-009: halt message contains path but no TC-ID list when coverage is undefined", () => {
    // GIVEN: test-coverage violation WITHOUT a coverage field (only path)
    const violation: OutputViolation = {
      kind: "test-coverage",
      path: "specrunner/changes/foo/test-cases.md",
      policy: "halt",
      detail: [],
    };
    // No coverage field — should trigger "see file" fallback (T-03)

    // WHEN
    const halt = makeOutputGateHalt([violation], "test-materialize", "feat/foo");

    // THEN: rendered message contains "see file" (fallback) not a TC-ID list
    const rendered = halt.error.message + halt.error.hint;
    expect(rendered).toContain("specrunner/changes/foo/test-cases.md");
    // After T-03: no coverage → "see file" fallback
    expect(rendered).toMatch(/see file/i);
  });
});

// ---------------------------------------------------------------------------
// TC-010: test-materialize の test-coverage 契約が follow-up policy を宣言する
// ---------------------------------------------------------------------------
// Also covered by updated TC-TMB-04 in test-materialize-boundary.test.ts

describe("TC-010: TestMaterializeStep.outputContracts declares follow-up policy for test-coverage", () => {
  it("TC-010: the test-coverage contract returned by outputContracts has policy='follow-up'", () => {
    // GIVEN: TestMaterializeStep instance with appropriate state and deps
    const state = makeMinimalState();
    const deps = makeMinimalStepDeps("test-slug");

    // WHEN: outputContracts is called
    const contracts = TestMaterializeStep.outputContracts!(state, deps);

    // THEN: the test-coverage contract has policy "follow-up" (after T-05)
    const testCoverageContract = contracts.find((c) => c.kind === "test-coverage");
    expect(testCoverageContract).toBeDefined();
    expect(testCoverageContract?.policy).toBe("follow-up");
  });
});

// ---------------------------------------------------------------------------
// TC-011: step-context-builder が test-materialize の follow-up 契約から outputVerification を構築する
// ---------------------------------------------------------------------------

describe("TC-011: buildStepContext builds outputVerification from test-materialize follow-up contract", () => {
  it("TC-011: ctx.policy.outputVerification is defined and buildPrompt returns TC-ID repair instructions", async () => {
    // GIVEN: TestMaterializeStep with follow-up policy (after T-05)
    //        runtimeStrategy that returns a test-coverage violation with missing TC-001
    const state = makeMinimalState({ step: "test-materialize", branch: "feat/test-slug" });

    const testCoverageViolation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-001"],
      coverage: { missingTcIds: ["TC-001"], assertionlessTcIds: [] },
    } as unknown as OutputViolation;

    // Mock runtimeStrategy.validateStepOutputs returns the test-coverage violation
    const mockStrategy = {
      validateStepOutputs: vi.fn().mockResolvedValue({ violations: [testCoverageViolation] }),
    };

    const depsWithStrategy = {
      config: { version: 1, agents: {} },
      request: {
        type: "spec-change",
        title: "Test",
        slug: "test-slug",
        baseBranch: "main",
        content: "Add feature X",
        adr: false,
      },
      slug: "test-slug",
      runtimeStrategy: mockStrategy,
    } as unknown as PipelineDeps;

    // In-memory fs adapter (no rules, no project.md)
    const mockFs = {
      readFile: async (_p: string, _enc: string): Promise<string> => {
        throw new Error("not found");
      },
      readdir: async (_dir: string): Promise<string[]> => [],
    };

    // WHEN: buildStepContext is called
    const ctx = await buildStepContext(
      TestMaterializeStep,
      state,
      depsWithStrategy,
      tempDir,
      () => {},
      mockFs,
    );

    // THEN: outputVerification is defined (requires follow-up policy in outputContracts — T-05)
    expect(ctx.policy.outputVerification).toBeDefined();

    if (ctx.policy.outputVerification) {
      // buildPrompt with test-coverage violation should contain TC-001 repair instruction (T-04)
      const prompt = ctx.policy.outputVerification.buildPrompt([testCoverageViolation], 1);
      expect(prompt).toContain("TC-001");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-012: managed runtime の test-coverage 分岐が best-effort skip のまま
// ---------------------------------------------------------------------------

describe("TC-012: ManagedRuntime test-coverage contract → no violation (best-effort skip)", () => {
  it("TC-012: ManagedRuntime.validateStepOutputs returns no violation for test-coverage contract", async () => {
    // GIVEN: ManagedRuntime with test-coverage contract
    const sessionClient = {
      createSession: vi.fn(),
      sendUserMessage: vi.fn(),
      pollUntilComplete: vi.fn(),
      streamEvents: vi.fn(),
      getSessionUsage: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
      sendEvents: vi.fn().mockResolvedValue(undefined),
    };
    const githubClient = {
      getRawFile: vi.fn().mockResolvedValue(null),
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const repo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];

    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, repo, undefined, "ghp_test");

    const contracts: OutputContract[] = [
      { kind: "test-coverage", path: TC_REL_PATH, policy: "follow-up" },
    ];

    // WHEN: validateStepOutputs is called
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/test-slug");

    // THEN: no test-coverage violation (managed runtime skips test-coverage — best-effort)
    const testCoverageViolations = result.violations.filter((v) => v.kind === "test-coverage");
    expect(testCoverageViolations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-014: test-coverage violation の両カテゴリ空で follow-up prompt が fall back を出す (should)
// ---------------------------------------------------------------------------

describe("TC-014: buildOutputFollowUpPrompt falls back when both coverage categories are empty", () => {
  it("TC-014: prompt contains 'see <path> for uncovered must TCs' when both categories are empty", () => {
    // GIVEN: test-coverage violation with coverage.missingTcIds=[] and assertionlessTcIds=[]
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/foo/test-cases.md",
      policy: "follow-up" as const,
      detail: [],
      coverage: { missingTcIds: [], assertionlessTcIds: [] },
    } as unknown as OutputViolation;

    // WHEN
    const prompt = buildOutputFollowUpPrompt([violation]);

    // THEN: fallback message references the path (not empty TC-ID list)
    expect(prompt).toContain("specrunner/changes/foo/test-cases.md");
    // After T-04: both categories empty → fallback "see <path> for uncovered must TCs"
    expect(prompt).toMatch(/see.*specrunner\/changes\/foo\/test-cases\.md/i);
    // No bullet list of TC-IDs should appear (both categories empty)
    expect(prompt).not.toMatch(/TC-\d{3}/);
  });
});

// ---------------------------------------------------------------------------
// TC-015: halt メッセージで missing のみの場合 assertionless 節が省かれる (should)
// ---------------------------------------------------------------------------

describe("TC-015: makeOutputGateHalt for missing-only violation omits assertionless section", () => {
  it("TC-015: halt message contains 'missing TCs' section but NOT 'assertionless TCs' when only missing", () => {
    // GIVEN: test-coverage violation with only missingTcIds populated
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "halt" as const,
      detail: ["TC-010"],
      coverage: {
        missingTcIds: ["TC-010"],
        assertionlessTcIds: [],
      },
    } as unknown as OutputViolation;

    // WHEN
    const halt = makeOutputGateHalt([violation], "test-materialize", "feat/test-slug");

    // THEN: "TC-010" and "missing" are present, "assertionless" is absent
    const rendered = halt.error.message + halt.error.hint;
    expect(rendered).toContain("TC-010");
    expect(rendered).toMatch(/missing/i);
    // After T-03 with "; " joining and non-empty condition:
    // assertionless section should NOT appear when assertionlessTcIds is empty
    expect(rendered).not.toMatch(/assertionless TCs:/i);
  });
});

// ---------------------------------------------------------------------------
// TC-016: follow-up prompt で assertionless のみの場合 missing 修復指示が省かれる (could)
// ---------------------------------------------------------------------------

describe("TC-016: buildOutputFollowUpPrompt for assertionless-only omits missing repair instruction", () => {
  it("TC-016: prompt contains 'add assertion' for TC-020 but NOT 'write test' instruction for missing TCs", () => {
    // GIVEN: test-coverage violation with only assertionlessTcIds populated
    const violation = {
      kind: "test-coverage" as const,
      path: "specrunner/changes/test-slug/test-cases.md",
      policy: "follow-up" as const,
      detail: ["TC-020"],
      coverage: {
        missingTcIds: [],
        assertionlessTcIds: ["TC-020"],
      },
    } as unknown as OutputViolation;

    // WHEN
    const prompt = buildOutputFollowUpPrompt([violation]);

    // THEN: TC-020 appears with assertion-add instruction, no missing-TC "write test" instruction
    expect(prompt).toContain("TC-020");
    // After T-04: assertionless → "add assertion" instruction
    expect(prompt.toLowerCase()).toMatch(/assert/i);
    // After T-04: missing section should NOT appear when missingTcIds is empty
    // "write test and embed TC-ID" instruction should be absent
    expect(prompt.toLowerCase()).not.toMatch(/テストを書き.*tc-id|write.*test.*tc-id/i);
  });
});
