/**
 * Docs contract tests for the test-coverage traceability convention.
 *
 * TC-006: docs が走査規約とトレーサビリティ規約を含む
 * TC-007: docs/README.md のファイル一覧に test-coverage.md が掲載される
 *
 * Source:
 *   TC-006: spec.md > Requirement: docs に走査規約とトレーサビリティ規約を明文化する > Scenario: docs が走査規約とトレーサビリティ規約を含む
 *   TC-007: tasks.md > T-02
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DOCS_DIR = path.resolve(process.cwd(), "docs");
const TEST_COVERAGE_DOC_PATH = path.join(DOCS_DIR, "test-coverage.md");
const README_DOC_PATH = path.join(DOCS_DIR, "README.md");

// ---------------------------------------------------------------------------
// TC-006: docs が走査規約とトレーサビリティ規約を含む
//
// Given: docs のカバレッジ規約ドキュメント (docs/test-coverage.md)
// When:  その内容を読む
// Then:  test-coverage が TC-ID リテラルを走査する旨と、
//        トレーサビリティコメントが既存カバレッジの表明手段である旨の双方が記述されている
// ---------------------------------------------------------------------------

describe("TC-006: docs が走査規約とトレーサビリティ規約を含む", () => {
  it("docs/test-coverage.md が存在する", async () => {
    let stat;
    try {
      stat = await fs.stat(TEST_COVERAGE_DOC_PATH);
    } catch {
      stat = null;
    }
    expect(stat, "docs/test-coverage.md must exist (created by T-02)").not.toBeNull();
    expect(stat?.isFile()).toBe(true);
  });

  it("docs/test-coverage.md に TC-ID リテラル走査の記述が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must describe that test-coverage scans test files for TC-ID literals
    const hasLiteralScan =
      content.includes("リテラル") ||
      content.includes("literal") ||
      content.includes("走査") ||
      content.includes("scan");
    expect(
      hasLiteralScan,
      "docs/test-coverage.md must describe TC-ID literal scan",
    ).toBe(true);
  });

  it("docs/test-coverage.md にトレーサビリティコメントによる既存カバレッジ表明の記述が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must describe that adding a traceability comment (// TC-0XX) to existing tests
    // is the formal means to express that the existing test covers the TC.
    const hasTraceabilityCommentRef =
      content.includes("// TC-") ||
      content.includes("TC-0") ||
      content.includes("トレーサビリティ") ||
      content.includes("traceability");
    expect(
      hasTraceabilityCommentRef,
      "docs/test-coverage.md must describe the traceability comment convention (// TC-0XX)",
    ).toBe(true);
  });

  it("docs/test-coverage.md に既存テストへの追記が充足の正式表明手段である旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must state that adding a comment to an existing test is the formal method,
    // not creating a new test or stopping.
    const hasExistingTestRef =
      content.includes("既存テスト") ||
      content.includes("既存のテスト") ||
      content.includes("existing test") ||
      content.includes("pre-existing");
    expect(
      hasExistingTestRef,
      "docs/test-coverage.md must mention that the traceability comment goes into an existing test",
    ).toBe(true);
  });

  it("docs/test-coverage.md に assertion なしファイルは assertionless 判定になる旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must warn that the traceability comment must be placed in a file with assertions,
    // not just any file.
    const hasAssertionWarning =
      content.includes("assertion") ||
      content.includes("assert") ||
      content.includes("expect(") ||
      content.includes("assertionless");
    expect(
      hasAssertionWarning,
      "docs/test-coverage.md must mention the assertion requirement (assertionless files fail coverage)",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007: docs/README.md のファイル一覧に test-coverage.md が掲載される
//
// Given: docs/README.md が存在し、変更後の docs/test-coverage.md が新規作成されている
// When:  docs/README.md の内容を読む
// Then:  ファイル一覧に test-coverage.md のエントリが存在する
// ---------------------------------------------------------------------------

describe("TC-007: docs/README.md のファイル一覧に test-coverage.md が掲載される", () => {
  it("docs/README.md に 'test-coverage.md' への言及が存在する", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    expect(
      content,
      "docs/README.md must list test-coverage.md in the file table",
    ).toContain("test-coverage.md");
  });

  it("docs/README.md の docs/ ファイル一覧表に test-coverage.md のリンクまたはエントリが含まれる", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    // The entry should appear in the table format, e.g.:
    //   | [test-coverage.md](test-coverage.md) | ... |
    // or at minimum contain the string "test-coverage.md"
    const hasEntry =
      content.includes("[test-coverage.md]") ||
      content.includes("test-coverage.md");
    expect(
      hasEntry,
      "docs/README.md docs/ ファイル一覧に test-coverage.md が載っていない",
    ).toBe(true);
  });
});
