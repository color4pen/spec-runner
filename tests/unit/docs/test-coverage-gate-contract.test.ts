/**
 * Docs contract tests for the gate TC coverage exclusion convention.
 *
 * TC-011: docs/test-coverage.md が gate 除外規約を含む
 * TC-012: docs/README.md の test-coverage.md 説明行に gate 除外が反映されている
 *
 * Source:
 *   TC-011: spec.md > Requirement: template / docs は gate 分類を明文化する
 *             > Scenario: docs が gate 除外規約を含む
 *   TC-012: tasks.md > T-04: template / docs を gate を含む形に追随する
 *
 * RED tests: intentionally fail until T-04 is implemented.
 * New file — does NOT modify tests/unit/docs/test-coverage-docs-contract.test.ts
 *           or tests/unit/docs/test-coverage-manual-contract.test.ts.
 *
 * Discriminator note:
 *   The current docs/test-coverage.md already contains "gate" in two contexts:
 *   - "gate の偽装 pass" (in the manual TC section)
 *   - "conformance / レビュー gate の管轄" (in the manual TC section)
 *   Assertions therefore use "gate TC", "**Category**: gate", or "Category: gate"
 *   as discriminators, since these exact phrases do NOT appear in the current docs
 *   but WILL appear after T-04 adds the gate exclusion section.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DOCS_DIR = path.resolve(process.cwd(), "docs");
const TEST_COVERAGE_DOC_PATH = path.join(DOCS_DIR, "test-coverage.md");
const README_DOC_PATH = path.join(DOCS_DIR, "README.md");

// ---------------------------------------------------------------------------
// TC-011: docs/test-coverage.md が gate 除外規約を含む
//
// Given:  docs/test-coverage.md
// When:   その内容を読む
// Then:   `**Category**: gate` の must TC が coverage 集計から除外される旨と、
//         その充足が verification phase の管轄である旨が記述されており、
//         既存の走査規約・トレーサビリティ規約・manual 除外規約の記述も残っている
// ---------------------------------------------------------------------------

describe("TC-011: docs/test-coverage.md が gate 除外規約を含む", () => {
  it("TC-011: docs/test-coverage.md に **Category**: gate の must TC が coverage 集計から除外される旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must explicitly describe Category: gate must TC exclusion.
    // Discriminator: "**Category**: gate" or "gate TC" (not just "gate").
    // The current docs have "gate の偽装 pass" and "レビュー gate の管轄" for manual TCs,
    // but NOT "**Category**: gate" or "gate TC" as a category classification term.
    const hasGateExclusion =
      content.includes("**Category**: gate") ||
      content.includes("Category: gate") ||
      (content.includes("gate TC") &&
        (content.includes("除外") || content.includes("excluded") || content.includes("集計から除外")));
    expect(
      hasGateExclusion,
      "docs/test-coverage.md must explicitly describe Category: gate must TC exclusion " +
        "using '**Category**: gate' or 'gate TC'. " +
        "Note: existing 'gate の偽装 pass' and 'レビュー gate の管轄' (for manual TCs) do not satisfy this.",
    ).toBe(true);
  });

  it("TC-011: docs/test-coverage.md に gate TC の充足が verification phase の管轄である旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must state that gate TC verification is handled by verification phase (build/typecheck/test/lint).
    // Discriminator: "gate TC" or "**Category**: gate" combined with verification phase mention.
    const hasVerificationPhaseRef =
      (content.includes("**Category**: gate") || content.includes("gate TC")) &&
      (content.includes("verification phase") ||
        content.includes("verification") ||
        content.includes("管轄") ||
        content.includes("build") ||
        content.includes("typecheck"));
    expect(
      hasVerificationPhaseRef,
      "docs/test-coverage.md must state (using 'gate TC' or '**Category**: gate') " +
        "that gate TC fulfillment belongs to verification phase.",
    ).toBe(true);
  });

  it("TC-011: docs/test-coverage.md に gate TC にトレーサビリティコメントを追記する必要がない旨が含まれる", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    // Must mention that gate TCs don't need traceability comments.
    // Discriminator: "gate TC" or "**Category**: gate" + not-required phrase.
    const hasGateTraceabilityNote =
      (content.includes("**Category**: gate") || content.includes("gate TC")) &&
      (content.includes("追記する必要はない") ||
        content.includes("不要") ||
        content.includes("not required") ||
        content.includes("追記しない") ||
        content.includes("対象外") ||
        content.includes("偽装"));
    expect(
      hasGateTraceabilityNote,
      "docs/test-coverage.md must state (using 'gate TC' or '**Category**: gate') " +
        "that gate TCs do not require traceability comments.",
    ).toBe(true);
  });

  it("TC-011: docs/test-coverage.md に既存の TC-ID リテラル走査の記述が残っている（回帰なし）", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
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

  it("TC-011: docs/test-coverage.md に既存のトレーサビリティコメント規約の記述が残っている（回帰なし）", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
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

  it("TC-011: docs/test-coverage.md に既存の manual 除外規約の記述が残っている（回帰なし）", async () => {
    const content = await fs.readFile(TEST_COVERAGE_DOC_PATH, "utf-8");
    const hasManualExclusion =
      content.includes("manual") &&
      (content.includes("除外") || content.includes("excluded"));
    expect(
      hasManualExclusion,
      "docs/test-coverage.md must retain the manual TC exclusion description",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012: docs/README.md の test-coverage.md 説明行に gate 除外が反映されている
//
// Given:  docs/README.md の docs 一覧に test-coverage.md の説明行がある
// When:   その説明行を確認する
// Then:   説明文に gate 除外（または manual と gate の両方の除外）が反映されており、
//         既存の test-coverage.md 行エントリが削除されていない
// ---------------------------------------------------------------------------

describe("TC-012: docs/README.md の test-coverage.md 説明行に gate 除外が反映されている", () => {
  it("TC-012: docs/README.md に test-coverage.md エントリが存在する（削除されていない）(regression)", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    expect(
      content,
      "docs/README.md must still list test-coverage.md (must not be deleted)",
    ).toContain("test-coverage.md");
  });

  it("TC-012: docs/README.md の test-coverage.md エントリの説明文に gate 除外への言及が含まれる", async () => {
    const content = await fs.readFile(README_DOC_PATH, "utf-8");
    // Find lines that contain test-coverage.md and check for gate reference
    const lines = content.split("\n");
    const tcDocLines = lines.filter((line) => line.includes("test-coverage.md"));
    const hasGateRef = tcDocLines.some(
      (line) =>
        line.includes("gate") ||
        line.includes("gate 除外") ||
        line.includes("gate TC"),
    );
    expect(
      hasGateRef,
      `docs/README.md test-coverage.md entry must mention gate exclusion. Found lines: ${JSON.stringify(tcDocLines)}`,
    ).toBe(true);
  });
});
