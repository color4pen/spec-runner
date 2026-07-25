/**
 * Docs contract tests for the manual TC coverage exclusion convention.
 *
 * TC-004: docs が manual 除外規約を含む
 * TC-008: docs/README.md の test-coverage.md 説明文に manual 除外が反映される
 *
 * Source:
 *   TC-004: spec.md > Requirement: docs は manual TC の coverage 集計除外を明文化する
 *             > Scenario: docs が manual 除外規約を含む
 *   TC-008: tasks.md > T-03 Acceptance Criteria
 *
 * These tests are intentionally red until T-03 (docs update) is implemented.
 * New file — does NOT modify tests/unit/docs/test-coverage-docs-contract.test.ts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DOCS_DIR = path.resolve(process.cwd(), "docs");
const TEST_COVERAGE_DOC_PATH = path.join(DOCS_DIR, "test-coverage.md");
const README_DOC_PATH = path.join(DOCS_DIR, "README.md");

// ---------------------------------------------------------------------------
// TC-004: docs が manual 除外規約を含む
//
// Given:  docs/test-coverage.md
// When:   その内容を読む
// Then:   manual カテゴリの must TC が coverage 集計から除外される旨と、
//         その検証が conformance / レビュー gate の管轄である旨が記述されており、
//         既存の走査規約・トレーサビリティ規約の記述も残っている
// ---------------------------------------------------------------------------

describe("TC-004: docs が manual 除外規約を含む", () => {
  it("docs/test-coverage.md に **Category**: manual の must TC が coverage 集計から除外される旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must describe that Category: manual must TCs are excluded from coverage aggregation
    const hasManualExclusion =
      content.includes("manual") &&
      (content.includes("除外") ||
        content.includes("excluded") ||
        content.includes("集計から除外") ||
        content.includes("coverage 集計"));
    expect(
      hasManualExclusion,
      "docs/test-coverage.md must describe that Category: manual must TCs are excluded from coverage aggregation",
    ).toBe(true);
  });

  it("docs/test-coverage.md に manual TC の検証が conformance / レビュー gate の管轄である旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must state that manual TC verification belongs to conformance/review gate
    const hasConformanceRef =
      content.includes("conformance") ||
      content.includes("レビュー gate") ||
      content.includes("review gate") ||
      (content.includes("レビュー") && content.includes("管轄")) ||
      (content.includes("conformance") && content.includes("gate"));
    expect(
      hasConformanceRef,
      "docs/test-coverage.md must state that manual TC verification belongs to conformance/review gate",
    ).toBe(true);
  });

  it("docs/test-coverage.md に既存の TC-ID リテラル走査の記述が残っている", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Existing literal scan description must remain
    const hasLiteralScan =
      content.includes("リテラル") ||
      content.includes("literal") ||
      content.includes("走査") ||
      content.includes("scan");
    expect(
      hasLiteralScan,
      "docs/test-coverage.md must retain the TC-ID literal scan description",
    ).toBe(true);
  });

  it("docs/test-coverage.md に既存のトレーサビリティコメント規約の記述が残っている", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Existing traceability comment description must remain
    const hasTraceabilityRef =
      content.includes("// TC-") ||
      content.includes("TC-0") ||
      content.includes("トレーサビリティ") ||
      content.includes("traceability");
    expect(
      hasTraceabilityRef,
      "docs/test-coverage.md must retain the traceability comment convention description",
    ).toBe(true);
  });

  it("docs/test-coverage.md に既存の既存テストへの追記規約の記述が残っている", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Existing coverage expression via existing test description must remain
    const hasExistingTestRef =
      content.includes("既存テスト") ||
      content.includes("既存のテスト") ||
      content.includes("existing test") ||
      content.includes("pre-existing");
    expect(
      hasExistingTestRef,
      "docs/test-coverage.md must retain the existing test traceability description",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-008: docs/README.md の test-coverage.md 説明文に manual 除外が反映される
//
// Given:  docs/README.md に docs/ ファイル一覧が存在する
// When:   test-coverage.md のエントリ行の説明文を読む
// Then:   manual TC の coverage 集計除外への言及（例: "manual 除外"、"manual TC"、
//         "Category: manual" など）が説明文に含まれる
// ---------------------------------------------------------------------------

describe("TC-008: docs/README.md の test-coverage.md 説明文に manual 除外が反映される", () => {
  it("docs/README.md に test-coverage.md が掲載されている", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    expect(
      content,
      "docs/README.md must list test-coverage.md",
    ).toContain("test-coverage.md");
  });

  it("docs/README.md の test-coverage.md エントリの説明文に manual 除外への言及が含まれる", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    // The description for test-coverage.md in the table must mention manual exclusion
    // Find the line(s) that contain test-coverage.md and check near context
    const lines = content.split("\n");
    const tcDocLines = lines.filter((line) => line.includes("test-coverage.md"));
    const hasManualRef = tcDocLines.some(
      (line) =>
        line.includes("manual") ||
        line.includes("除外") ||
        line.includes("Category: manual") ||
        line.includes("manual TC"),
    );
    expect(
      hasManualRef,
      `docs/README.md test-coverage.md entry must mention manual exclusion. Found lines: ${JSON.stringify(tcDocLines)}`,
    ).toBe(true);
  });
});
