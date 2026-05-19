/**
 * Unit tests for src/core/verification/test-coverage.ts
 *
 * TC-001: PHASE_NAMES が6要素で test-coverage が末尾に追加されている
 * TC-002: PHASE_SCRIPTS に test-coverage エントリが含まれない
 * TC-003: ScriptPhaseName 型が test-coverage を除外している（runtime 検証）
 * TC-004: test-cases.md 不在のとき status "skipped" を返す
 * TC-005: test-cases.md 不在時 stdout に skip 理由が含まれる
 * TC-006: must TC 全件が tests/ に存在するとき status "passed" を返す
 * TC-007: must TC に欠損があるとき status "failed" + missingTcIds を返す
 * TC-008: must TC が0件（should/could のみ）のとき status "passed" を返す
 * TC-009: フラット型 TC-NNN を must TC として検出できる
 * TC-010: 階層型 TC-NN-NN を must TC として検出できる
 * TC-011: stdout に human-readable な網羅率サマリを生成する
 * TC-013: should/could TC は test-coverage 検証の対象外である
 * TC-027: PR #331 同型ケース — 大量 TC 生成 → 部分実装 → test-coverage で catch
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PHASE_NAMES, PHASE_SCRIPTS } from "../../../../src/core/verification/phases.js";
import { runTestCoveragePhase, extractMustTcIds } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-coverage-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase type system tests (TC-001, TC-002, TC-003)
// ──────────────────────────────────────────────────────────────────────────────

// TC-001: PHASE_NAMES が6要素で test-coverage が末尾
describe("TC-001: PHASE_NAMES — 6要素で test-coverage が末尾", () => {
  it("PHASE_NAMES は6要素", () => {
    expect(PHASE_NAMES.length).toBe(6);
  });

  it("末尾が test-coverage", () => {
    expect(PHASE_NAMES[PHASE_NAMES.length - 1]).toBe("test-coverage");
  });

  it("先頭5要素は既存の5 phase", () => {
    expect(Array.from(PHASE_NAMES.slice(0, 5))).toEqual([
      "build",
      "typecheck",
      "test",
      "lint",
      "security",
    ]);
  });
});

// TC-002: PHASE_SCRIPTS に test-coverage エントリが含まれない
describe("TC-002: PHASE_SCRIPTS — test-coverage キーが存在しない", () => {
  it("PHASE_SCRIPTS には test-coverage キーがない", () => {
    expect("test-coverage" in PHASE_SCRIPTS).toBe(false);
  });

  it("PHASE_SCRIPTS は5エントリのまま", () => {
    expect(Object.keys(PHASE_SCRIPTS).length).toBe(5);
  });

  it("PHASE_SCRIPTS には既存の5 phase が含まれる", () => {
    const keys = Object.keys(PHASE_SCRIPTS);
    expect(keys).toContain("build");
    expect(keys).toContain("typecheck");
    expect(keys).toContain("test");
    expect(keys).toContain("lint");
    expect(keys).toContain("security");
  });
});

// TC-003: ScriptPhaseName が test-coverage を除外 (runtime check via PHASE_SCRIPTS shape)
describe("TC-003: ScriptPhaseName — test-coverage を除外", () => {
  it("PHASE_SCRIPTS のキーに test-coverage が含まれない (ScriptPhaseName の実証)", () => {
    // ScriptPhaseName = Exclude<PhaseName, "test-coverage">
    // If PHASE_SCRIPTS: Record<ScriptPhaseName, string> compiles without "test-coverage",
    // the type constraint is enforced. Runtime: verify shape matches expected 5 keys.
    const expectedKeys = ["build", "typecheck", "test", "lint", "security"].sort();
    const actualKeys = Object.keys(PHASE_SCRIPTS).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: write test-cases.md into the temp change folder
// ──────────────────────────────────────────────────────────────────────────────

async function writeTestCasesMd(slug: string, content: string): Promise<void> {
  const dir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-cases.md"), content, "utf-8");
}

async function writeTestFile(relPath: string, content: string): Promise<void> {
  const full = path.join(tempDir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

// ──────────────────────────────────────────────────────────────────────────────
// TC-004: test-cases.md 不在のとき status "skipped"
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-004: test-cases.md 不在 → status: skipped", () => {
  it("test-cases.md が存在しない場合 status: 'skipped' を返す", async () => {
    const result = await runTestCoveragePhase("no-such-change", tempDir);
    expect(result.status).toBe("skipped");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-005: test-cases.md 不在時 stdout に skip 理由が含まれる
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-005: test-cases.md 不在時 stdout に skip 理由が含まれる", () => {
  it("stdout に 'test-cases.md not found at specrunner/changes/<slug>/test-cases.md' が含まれる", async () => {
    const result = await runTestCoveragePhase("my-slug", tempDir);
    expect(result.stdout).toContain("test-cases.md not found at");
    expect(result.stdout).toContain("specrunner/changes/my-slug/test-cases.md");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-006: must TC 全件が tests/ に存在するとき status "passed"
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-006: must TC 全件が tests/ に存在するとき status: passed", () => {
  it("TC-001, TC-002, TC-003 が全て tests/ に出現 → status: 'passed', missingTcIds: []", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: First test
**Priority**: must

## TC-002: Second test
**Priority**: must

## TC-003: Third test
**Priority**: must
`,
    );
    await writeTestFile(
      "tests/unit/a.test.ts",
      `
it("TC-001: first", () => {});
it("TC-002: second", () => {});
it("TC-003: third", () => {});
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.missingTcIds).toEqual([]);
    expect(result.foundTcIds).toEqual(expect.arrayContaining(["TC-001", "TC-002", "TC-003"]));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-007: must TC に欠損があるとき status "failed" + missingTcIds
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-007: must TC に欠損 → status: failed + missingTcIds", () => {
  it("TC-001 のみ出現し TC-002, TC-003 が未出現 → status: 'failed', missingTcIds に2件", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: First test
**Priority**: must

## TC-002: Second test
**Priority**: must

## TC-003: Third test
**Priority**: must
`,
    );
    await writeTestFile("tests/unit/a.test.ts", `it("TC-001: first", () => {});`);

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toEqual(expect.arrayContaining(["TC-002", "TC-003"]));
    expect(result.missingTcIds).not.toContain("TC-001");
    expect(result.foundTcIds).toContain("TC-001");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-008: must TC が0件（should/could のみ）→ status "passed"
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-008: must TC が0件（should/could のみ）→ status: passed", () => {
  it("should/could のみで must が0件 → status: 'passed'（検証対象なし）", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: Should test
**Priority**: should

## TC-002: Could test
**Priority**: could
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.totalMustTcs).toBe(0);
    expect(result.missingTcIds).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-009: フラット型 TC-NNN を must TC として検出できる
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-009: フラット型 TC-NNN を must TC として検出", () => {
  it("## TC-010 ヘッダを持つ must TC → tests/ で TC-010 が found", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-010: Flat format test
**Priority**: must
`,
    );
    await writeTestFile("tests/unit/a.test.ts", `it("TC-010: flat format", () => {});`);

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-010");
    expect(result.missingTcIds).not.toContain("TC-010");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-010: 階層型 TC-NN-NN を must TC として検出できる
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-010: 階層型 TC-NN-NN を must TC として検出", () => {
  it("## TC-10-01 ヘッダを持つ must TC → tests/ で TC-10-01 が found", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-10-01: Hierarchical format test
**Priority**: must
`,
    );
    await writeTestFile("tests/unit/a.test.ts", `it("TC-10-01: hierarchical", () => {});`);

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-10-01");
    expect(result.missingTcIds).not.toContain("TC-10-01");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-011: stdout に human-readable な網羅率サマリを生成する
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-011: stdout に human-readable な網羅率サマリを生成する", () => {
  it("5件の must TC のうち2件のみ実装 → stdout に '2/5 must TCs covered' と Missing リスト", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: test1
**Priority**: must

## TC-002: test2
**Priority**: must

## TC-003: test3
**Priority**: must

## TC-004: test4
**Priority**: must

## TC-005: test5
**Priority**: must
`,
    );
    await writeTestFile(
      "tests/unit/a.test.ts",
      `it("TC-001: first", () => {});
it("TC-002: second", () => {});`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.stdout).toContain("test-coverage: 2/5 must TCs covered");
    expect(result.stdout).toContain("Missing:");
    expect(result.stdout).toContain("TC-003");
    expect(result.stdout).toContain("TC-004");
    expect(result.stdout).toContain("TC-005");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-013: should/could TC は test-coverage 検証の対象外
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-013: should/could TC は test-coverage 検証の対象外", () => {
  it("must TC 2件 + should/could TC 4件 → must のみ検証し should/could の未実装は verdict に影響しない", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: Must test 1
**Priority**: must

## TC-002: Must test 2
**Priority**: must

## TC-003: Should test
**Priority**: should

## TC-004: Could test
**Priority**: could
`,
    );
    // Implement only must TCs; should/could are NOT in tests/
    await writeTestFile(
      "tests/unit/a.test.ts",
      `it("TC-001: must 1", () => {});
it("TC-002: must 2", () => {});`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.totalMustTcs).toBe(2);
    expect(result.missingTcIds).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// extractMustTcIds unit tests (bullet/non-bullet Priority: must, h3 headers)
// ──────────────────────────────────────────────────────────────────────────────

describe("extractMustTcIds — bullet prefix あり・なし両パターン (TC-012 related)", () => {
  it("'- **Priority**: must' (bullet) を検出する", () => {
    const content = `
## TC-001: with bullet
- **Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-001");
  });

  it("'**Priority**: must' (bullet なし) を検出する", () => {
    const content = `
## TC-002: without bullet
**Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-002");
  });
});

describe("extractMustTcIds — h2/h3 両形式 (TC-014 related)", () => {
  it("'## TC-020' (h2) を検出する", () => {
    const content = `
## TC-020: h2 format
**Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-020");
  });

  it("'### TC-021' (h3) を検出する", () => {
    const content = `
### TC-021: h3 format
**Priority**: must
`;
    expect(extractMustTcIds(content)).toContain("TC-021");
  });
});

describe("runTestCoveragePhase — 複数ファイルにまたがる TC 検出 (TC-015 related)", () => {
  it("TC-001/TC-002/TC-003 が別ファイルに分散していても全件 found", async () => {
    const slug = "my-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: test a
**Priority**: must

## TC-002: test b
**Priority**: must

## TC-003: test c
**Priority**: must
`,
    );
    await writeTestFile("tests/unit/a.test.ts", `it("TC-001: a", () => {});`);
    await writeTestFile("tests/unit/b.test.ts", `it("TC-002: b", () => {});`);
    await writeTestFile("tests/integration/c.test.ts", `it("TC-003: c", () => {});`);

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toEqual(expect.arrayContaining(["TC-001", "TC-002", "TC-003"]));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TC-027: PR #331 同型ケース回帰テスト
// ──────────────────────────────────────────────────────────────────────────────

describe("TC-027: PR #331 同型ケース — 大量 TC 生成 → 部分実装 → test-coverage で catch", () => {
  it("5件 must TC のうち TC-001/TC-002 のみ実装 → failed + missingTcIds に TC-003〜TC-005", async () => {
    const slug = "large-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-001: Feature A
**Priority**: must

## TC-002: Feature B
**Priority**: must

## TC-003: Feature C
**Priority**: must

## TC-004: Feature D
**Priority**: must

## TC-005: Feature E
**Priority**: must
`,
    );
    // Only TC-001 and TC-002 implemented
    // Only the first two TCs are implemented; the rest are absent from test code
    await writeTestFile(
      "tests/unit/large-change.test.ts",
      `
describe("large-change tests", () => {
  it("TC-001: Feature A works", () => { expect(true).toBe(true); });
  it("TC-002: Feature B works", () => { expect(true).toBe(true); });
});
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toEqual(expect.arrayContaining(["TC-003", "TC-004", "TC-005"]));
    expect(result.missingTcIds).not.toContain("TC-001");
    expect(result.missingTcIds).not.toContain("TC-002");
    expect(result.foundTcIds).toContain("TC-001");
    expect(result.foundTcIds).toContain("TC-002");
    expect(result.stdout).toContain("test-coverage: 2/5 must TCs covered");
  });
});
