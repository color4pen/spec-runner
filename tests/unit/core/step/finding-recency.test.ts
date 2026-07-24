/**
 * Unit tests for finding-recency pure function and record logic.
 *
 * TC-002: 前 revision に存在した記述への指摘は late (must)
 * TC-003: fixer が書き足した記述への指摘は not-late (must)
 * TC-004: 判定不能はすべて indeterminate (must)
 * TC-005: iteration 2 で per-finding の後出し判定が記録される (must)
 * TC-006: iteration 1 では finding-recency 記録が append されない (must)
 * TC-007: late な finding を含む round でも verdict は不変 (must)
 * TC-008: late が 1 件以上で stderr 要約が出る (must)
 * TC-010: 空白のみの対象行は indeterminate (should)
 * TC-011: trim 済みで一致する行は行番号ずれがあっても late (should)
 * TC-016: readRevisionContent 未実装の runtimeStrategy で全 finding を indeterminate にする (must)
 * TC-017: late が 0 件のとき stderrWrite を呼ばない (should)
 * TC-018: finding が 0 件のとき appendFindingRecency を呼ばない (should)
 *
 * All tests are intentionally RED until T-02 and T-04 (finding-recency module) are implemented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Imports from the not-yet-existing module (will fail until T-02 is implemented)
// ---------------------------------------------------------------------------

import {
  classifyFindingRecency,
  computeFindingRecency,
  recordFindingRecency,
} from "../../../../src/core/step/finding-recency.js";
import type {
  FindingRecency,
  FindingRecencyStore,
} from "../../../../src/core/step/finding-recency.js";
import type { Finding } from "../../../../src/kernel/report-result.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Finding object for tests.
 */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    line: 1,
    title: "Test finding",
    rationale: "because",
    ...overrides,
  };
}

/**
 * Build a fake RuntimeStrategy with readRevisionContent returning the given pair.
 * Only supplies the methods needed for finding-recency tests.
 */
function makeFakeRuntime(opts: {
  current: string | null;
  prior: string | null;
} = { current: null, prior: null }): RuntimeStrategy {
  return {
    readRevisionContent: vi.fn().mockResolvedValue(opts),
    bootstrapJob: vi.fn(),
    persistJobState: vi.fn(),
    query: vi.fn(),
    createAgentRunner: vi.fn(),
    setupWorkspace: vi.fn(),
    buildDeps: vi.fn(),
    registerCleanup: vi.fn(),
    teardown: vi.fn(),
    captureHeadSha: vi.fn(),
    prepareStepArtifacts: vi.fn(),
    finalizeStepArtifacts: vi.fn(),
    validateStepInputs: vi.fn(),
    validateStepOutputs: vi.fn(),
    commitFinalState: vi.fn(),
    verifyFindingRefs: vi.fn(),
    digestArtifacts: vi.fn(),
    listChangedFiles: vi.fn(),
  } as unknown as RuntimeStrategy;
}

/**
 * Build a fake RuntimeStrategy WITHOUT readRevisionContent.
 */
function makeFakeRuntimeNoReadRevision(): RuntimeStrategy {
  return {
    bootstrapJob: vi.fn(),
    persistJobState: vi.fn(),
    query: vi.fn(),
    createAgentRunner: vi.fn(),
    setupWorkspace: vi.fn(),
    buildDeps: vi.fn(),
    registerCleanup: vi.fn(),
    teardown: vi.fn(),
    captureHeadSha: vi.fn(),
    prepareStepArtifacts: vi.fn(),
    finalizeStepArtifacts: vi.fn(),
    validateStepInputs: vi.fn(),
    validateStepOutputs: vi.fn(),
    commitFinalState: vi.fn(),
    verifyFindingRefs: vi.fn(),
    digestArtifacts: vi.fn(),
    listChangedFiles: vi.fn(),
    // readRevisionContent intentionally omitted
  } as unknown as RuntimeStrategy;
}

/**
 * Build a fake FindingRecencyStore with spied appendFindingRecency.
 */
function makeFakeStore() {
  const appendFindingRecencyMock = vi.fn().mockResolvedValue(undefined);
  const store: FindingRecencyStore = {
    appendFindingRecency: appendFindingRecencyMock,
  };
  return { store, appendFindingRecencyMock };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// TC-002: 前 revision に存在した記述への指摘は late
// Source: spec.md > Requirement: 後出し判定は純関数として 3 値を返す
//         > Scenario: 前 revision に存在した記述への指摘は late
// ============================================================================

describe("TC-002: 前 revision に存在した記述への指摘は late", () => {
  it("TC-002: 対象行が前 revision のいずれかの行と trim 一致 → late", () => {
    const targetLineContent = "const x = 1;";
    const priorFileContent = "const y = 2;\nconst x = 1;\nconst z = 3;";

    const result: FindingRecency = classifyFindingRecency(targetLineContent, priorFileContent);
    expect(result).toBe("late");
  });

  it("TC-002: 前 revision の最初の行と一致 → late", () => {
    const targetLineContent = "export function foo() {}";
    const priorFileContent = "export function foo() {}\nexport function bar() {}";

    expect(classifyFindingRecency(targetLineContent, priorFileContent)).toBe("late");
  });

  it("TC-002: 前 revision の最後の行と一致 → late", () => {
    const targetLineContent = "export default App;";
    const priorFileContent = "import React from 'react';\nexport default App;";

    expect(classifyFindingRecency(targetLineContent, priorFileContent)).toBe("late");
  });
});

// ============================================================================
// TC-003: fixer が書き足した記述への指摘は not-late
// Source: spec.md > Requirement: 後出し判定は純関数として 3 値を返す
//         > Scenario: fixer が書き足した記述への指摘は not-late
// ============================================================================

describe("TC-003: fixer が書き足した記述への指摘は not-late", () => {
  it("TC-003: 対象行が前 revision のどの行とも一致しない → not-late", () => {
    const targetLineContent = "const newThing = 42;";
    const priorFileContent = "const y = 2;\nconst x = 1;";

    expect(classifyFindingRecency(targetLineContent, priorFileContent)).toBe("not-late");
  });

  it("TC-003: 前 revision が空文字列（新規ファイル相当）→ not-late", () => {
    const targetLineContent = "const brand = 'new';";
    const priorFileContent = "";

    expect(classifyFindingRecency(targetLineContent, priorFileContent)).toBe("not-late");
  });
});

// ============================================================================
// TC-004: 判定不能はすべて indeterminate
// Source: spec.md > Requirement: 後出し判定は純関数として 3 値を返す
//         > Scenario: 判定不能はすべて indeterminate
// ============================================================================

describe("TC-004: 判定不能はすべて indeterminate", () => {
  it("TC-004: targetLineContent が null（line 欠落）→ indeterminate", () => {
    expect(classifyFindingRecency(null, "some prior content")).toBe("indeterminate");
  });

  it("TC-004: priorFileContent が null（前 revision 解決不能）→ indeterminate", () => {
    expect(classifyFindingRecency("some line", null)).toBe("indeterminate");
  });

  it("TC-004: 両方 null → indeterminate", () => {
    expect(classifyFindingRecency(null, null)).toBe("indeterminate");
  });
});

// ============================================================================
// TC-010: 空白のみの対象行は indeterminate (should)
// Source: tasks.md > T-02
// ============================================================================

describe("TC-010: 空白のみの対象行は indeterminate (should)", () => {
  it("TC-010: targetLineContent が空白文字のみ → indeterminate", () => {
    expect(classifyFindingRecency("   ", "some prior content")).toBe("indeterminate");
  });

  it("TC-010: targetLineContent がタブ文字のみ → indeterminate", () => {
    expect(classifyFindingRecency("\t\t", "some prior content")).toBe("indeterminate");
  });

  it("TC-010: targetLineContent が空文字列 → indeterminate", () => {
    // trim() of "" is "" which is === "" → indeterminate (needle empty)
    expect(classifyFindingRecency("", "some prior content")).toBe("indeterminate");
  });
});

// ============================================================================
// TC-011: trim 済みで一致する行は行番号ずれがあっても late (should)
// Source: design.md > D4 (行番号ずれに頑健な内容一致)
// ============================================================================

describe("TC-011: trim 済みで一致する行は行番号ずれがあっても late (should)", () => {
  it("TC-011: 前後空白付き targetLineContent が前 revision の trim 一致行を見つける → late", () => {
    // targetLineContent has leading whitespace; prior has the trimmed version
    const target = "  const x = 1;";
    const prior = "const y = 2;\nconst x = 1;\nconst z = 3;";

    expect(classifyFindingRecency(target, prior)).toBe("late");
  });

  it("TC-011: prior の各行が trim されて照合される → late", () => {
    // Prior line has leading whitespace; target is trimmed
    const target = "const x = 1;";
    const prior = "  const y = 2;\n  const x = 1;\n  const z = 3;";

    expect(classifyFindingRecency(target, prior)).toBe("late");
  });
});

// ============================================================================
// TC-016: readRevisionContent 未実装の runtimeStrategy で全 finding を indeterminate にする
// Source: tasks.md > T-04 (fail-to-indeterminate)
// ============================================================================

describe("TC-016: readRevisionContent 未実装の runtimeStrategy で全 finding を indeterminate にする", () => {
  it("TC-016: runtimeStrategy に readRevisionContent がない → 全 finding が indeterminate", async () => {
    const fakeRuntime = makeFakeRuntimeNoReadRevision();

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 10 }),
      makeFinding({ file: "src/bar.ts", line: 20, title: "Second finding" }),
    ];

    const results = await computeFindingRecency(
      findings,
      "abc123deadbeef",
      "/some/cwd",
      "main",
      fakeRuntime,
    );

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.recency).toBe("indeterminate");
    }
  });

  it("TC-016: runtimeStrategy に readRevisionContent がない → finding が 1 件でも indeterminate", async () => {
    const fakeRuntime = makeFakeRuntimeNoReadRevision();
    const findings: Finding[] = [makeFinding({ file: "src/foo.ts", line: 5 })];

    const results = await computeFindingRecency(findings, "abc123", "/cwd", "main", fakeRuntime);

    expect(results).toHaveLength(1);
    expect(results[0]?.recency).toBe("indeterminate");
  });
});

// ============================================================================
// TC-005: iteration 2 で per-finding の後出し判定が記録される
// Source: spec.md > Requirement: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する
//         > Scenario: iteration 2 で per-finding の後出し判定が記録される
// ============================================================================

describe("TC-005: iteration 2 で per-finding の後出し判定が記録される", () => {
  it("TC-005: iteration=2, 2 件の finding → appendFindingRecency が 1 件呼ばれる", async () => {
    const { store, appendFindingRecencyMock } = makeFakeStore();

    // Prior content contains line 1 (= "old code line") but not line 2 (= "new code line")
    const priorContent = "old code line\nsome other line\n";
    const currentContent = "old code line\nnew code line\n";
    const fakeRuntime = makeFakeRuntime({ current: currentContent, prior: priorContent });

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1, title: "Old finding" }),  // line 1 = "old code line" → exists in prior → late
      makeFinding({ file: "src/foo.ts", line: 2, title: "New finding" }),  // line 2 = "new code line" → not in prior → not-late
    ];

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings,
      cwd: "/some/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    // appendFindingRecency should be called exactly once
    expect(appendFindingRecencyMock).toHaveBeenCalledTimes(1);

    // The record should have per-finding recency data
    const record = appendFindingRecencyMock.mock.calls[0]?.[0];
    expect(record).toBeDefined();
    expect(record?.step).toBe("spec-review");
    expect(record?.iteration).toBe(2);
    expect(record?.findings).toHaveLength(2);

    // Per-finding recency: first finding is late, second is not-late
    const lateFindings = record?.findings?.filter((f: { recency: string }) => f.recency === "late");
    const notLateFindings = record?.findings?.filter((f: { recency: string }) => f.recency === "not-late");
    expect(lateFindings).toHaveLength(1);
    expect(notLateFindings).toHaveLength(1);
  });
});

// ============================================================================
// TC-006: iteration 1 では finding-recency 記録が append されない
// Source: spec.md > Requirement: iteration 1 では後出し判定を実行しない
//         > Scenario: iteration 1 では finding-recency 記録が append されない
// ============================================================================

describe("TC-006: iteration 1 では finding-recency 記録が append されない", () => {
  it("TC-006: iteration=1 → appendFindingRecency が呼ばれない", async () => {
    const { store, appendFindingRecencyMock } = makeFakeStore();
    const fakeRuntime = makeFakeRuntime({ current: "some content", prior: "some prior" });

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1, title: "A finding" }),
    ];

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 1,
      priorOid: null,
      findings,
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    expect(appendFindingRecencyMock).not.toHaveBeenCalled();
  });

  it("TC-006: iteration=1 かつ finding が複数でも appendFindingRecency が呼ばれない", async () => {
    const { store, appendFindingRecencyMock } = makeFakeStore();
    const fakeRuntime = makeFakeRuntime({ current: "content", prior: "prior" });

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 1,
      priorOid: null,
      findings: [
        makeFinding({ title: "Finding 1" }),
        makeFinding({ title: "Finding 2" }),
      ],
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    expect(appendFindingRecencyMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// TC-007: late な finding を含む round でも verdict は不変
// Source: spec.md > Requirement: 後出し検出は verdict を変更しない
//         > Scenario: late な finding を含む round でも verdict は不変
// ============================================================================

describe("TC-007: late な finding を含む round でも verdict は不変", () => {
  it("TC-007: recordFindingRecency は appendFindingRecency のみ呼び出し、verdict/state への書き戻し経路を持たない", async () => {
    // FindingRecencyStore has only appendFindingRecency.
    // If recordFindingRecency attempts to call any other store method, it would throw.
    // We verify the function completes without error with a store that ONLY has appendFindingRecency.

    const appendFindingRecencyMock = vi.fn().mockResolvedValue(undefined);
    const storeWithOnlyAppend: FindingRecencyStore = {
      appendFindingRecency: appendFindingRecencyMock,
      // No other methods — any attempt to call e.g. persist() or update() would throw
    };

    // Prior content contains the finding line → classified as late
    const priorContent = "existing problematic line\n";
    const currentContent = "existing problematic line\n";
    const fakeRuntime = makeFakeRuntime({ current: currentContent, prior: priorContent });

    const lateFindings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1, title: "Late finding" }),
    ];

    // Should complete without throwing (no verdict mutation attempted)
    await expect(recordFindingRecency({
      store: storeWithOnlyAppend,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings: lateFindings,
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    })).resolves.not.toThrow();

    // appendFindingRecency was called (journal updated)
    expect(appendFindingRecencyMock).toHaveBeenCalledTimes(1);

    // The record contains the late finding
    const record = appendFindingRecencyMock.mock.calls[0]?.[0];
    expect(record?.findings?.some((f: { recency: string }) => f.recency === "late")).toBe(true);
  });
});

// ============================================================================
// TC-008: late が 1 件以上で stderr 要約が出る
// Source: spec.md > Requirement: 後出しがある round では stderr に要約を出す
//         > Scenario: late が 1 件以上で stderr 要約が出る
// ============================================================================

describe("TC-008: late が 1 件以上で stderr 要約が出る", () => {
  it("TC-008: late が 1 件以上 → process.stderr.write が呼ばれ要約が含まれる", async () => {
    const { store } = makeFakeStore();

    // Prior content matches the finding's target line → classified as late
    const priorContent = "the problematic line\n";
    const currentContent = "the problematic line\n";
    const fakeRuntime = makeFakeRuntime({ current: currentContent, prior: priorContent });

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1, title: "Late finding" }),
    ];

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings,
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    // stderr should have been written (the spy is set up in beforeEach)
    const stderrSpy = vi.mocked(process.stderr.write);
    expect(stderrSpy).toHaveBeenCalled();

    // The stderr output should contain summary about late findings
    const calls = stderrSpy.mock.calls;
    const stderrOutput = calls.map((c) => String(c[0])).join("");
    // Should mention "late" or "後出し" in the summary
    expect(stderrOutput.toLowerCase()).toMatch(/late|後出し/);
  });
});

// ============================================================================
// TC-017: late が 0 件のとき stderrWrite を呼ばない (should)
// Source: tasks.md > T-04 (late が 0 件では stderr 出力しない)
// ============================================================================

describe("TC-017: late が 0 件のとき stderrWrite を呼ばない (should)", () => {
  it("TC-017: 全 finding が not-late → stderr に後出し要約が出ない", async () => {
    const { store } = makeFakeStore();

    // Prior content does NOT contain the finding's target line → all not-late
    const priorContent = "some other line\nanother line\n";
    const currentContent = "brand new line\nsome other line\n";
    const fakeRuntime = makeFakeRuntime({ current: currentContent, prior: priorContent });

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1, title: "New finding" }), // line 1 = "brand new line" → not in prior → not-late
    ];

    const stderrSpy = vi.mocked(process.stderr.write);
    const callsBefore = stderrSpy.mock.calls.length;

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings,
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    // No new stderr writes about late findings (the spy may have been called before,
    // but no additional calls should have occurred that mention "late/後出し")
    const newCalls = stderrSpy.mock.calls.slice(callsBefore);
    const newOutput = newCalls.map((c) => String(c[0])).join("");
    expect(newOutput.toLowerCase()).not.toMatch(/late|後出し/);
  });

  it("TC-017: 全 finding が indeterminate → stderr に後出し要約が出ない", async () => {
    const { store } = makeFakeStore();

    // Runtime cannot resolve revision content → all indeterminate
    const fakeRuntime = makeFakeRuntime({ current: null, prior: null });

    const findings: Finding[] = [
      makeFinding({ file: "src/foo.ts", line: 1 }),
    ];

    const stderrSpy = vi.mocked(process.stderr.write);
    const callsBefore = stderrSpy.mock.calls.length;

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings,
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    const newCalls = stderrSpy.mock.calls.slice(callsBefore);
    const newOutput = newCalls.map((c) => String(c[0])).join("");
    expect(newOutput.toLowerCase()).not.toMatch(/late|後出し/);
  });
});

// ============================================================================
// TC-018: finding が 0 件のとき appendFindingRecency を呼ばない (should)
// Source: tasks.md > T-04 (結果が空なら return)
// ============================================================================

describe("TC-018: finding が 0 件のとき appendFindingRecency を呼ばない (should)", () => {
  it("TC-018: findings が空配列 → appendFindingRecency が呼ばれない", async () => {
    const { store, appendFindingRecencyMock } = makeFakeStore();
    const fakeRuntime = makeFakeRuntime({ current: "content", prior: "prior" });

    await recordFindingRecency({
      store,
      stepName: "spec-review",
      iteration: 2,
      priorOid: "abc123",
      findings: [],  // no findings
      cwd: "/cwd",
      branch: "main",
      runtimeStrategy: fakeRuntime,
    });

    expect(appendFindingRecencyMock).not.toHaveBeenCalled();
  });
});
