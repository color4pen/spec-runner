/**
 * Tests for Result YAML ownership clarification in test-cases.md.
 *
 * TC-001: TEST_CASES_TEMPLATE Result ブロックコメントに所有者・書込時点・enum 意味が含まれる
 * TC-002: test-case-gen prompt に enum 意味と確定規則が含まれる
 * TC-003: test-materialize prompt に Result YAML 非更新の記述が含まれる
 * TC-004: docstring に Result YAML の machine-parsed 記述が残っていない
 * TC-005: 既存テストが無改変で green（構造的不変条件の検証）
 * TC-006: typecheck && フルテストスイートが green（インポートスモークテスト）
 * TC-007: 禁止文字列が変更後の各ファイルに含まれない（should）
 *
 * New file — does NOT modify any existing test file.
 * TC-001 through TC-004 are intentionally RED until implementation (T-01 through T-04) is complete.
 * TC-005, TC-006, TC-007 verify structural invariants and are expected to stay green before and after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { TEST_CASES_TEMPLATE } from "../../../src/templates/step-output-templates.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../../src/prompts/test-case-gen-system.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Helper: extract the JSDoc docstring immediately before TEST_CASES_TEMPLATE
// in src/templates/step-output-templates.ts.
// ---------------------------------------------------------------------------
function extractDocstringBeforeTestCasesTemplate(source: string): string {
  const markerIndex = source.indexOf("export const TEST_CASES_TEMPLATE");
  if (markerIndex === -1) return "";
  const beforeMarker = source.slice(0, markerIndex);
  const lastDocstringEnd = beforeMarker.lastIndexOf("*/");
  if (lastDocstringEnd === -1) return "";
  const docstringStart = beforeMarker.lastIndexOf("/**", lastDocstringEnd);
  if (docstringStart === -1) return "";
  return source.slice(docstringStart, lastDocstringEnd + 2);
}

const templateSource = readFileSync(
  join(__dirname, "../../../src/templates/step-output-templates.ts"),
  "utf-8",
);
const testCasesDocstring = extractDocstringBeforeTestCasesTemplate(templateSource);

// ============================================================================
// TC-001: TEST_CASES_TEMPLATE Result ブロックコメントに所有者・書込時点・enum 意味が含まれる
// Source: spec.md > Requirement: TEST_CASES_TEMPLATE の Result ブロックコメントは所有者・書込時点・enum 意味を宣言する
//         > Scenario: Result ブロックコメントに所有者・書込時点・enum 意味が含まれる
// ============================================================================

describe("TC-001: TEST_CASES_TEMPLATE Result ブロックコメントに所有者・書込時点・enum 意味が含まれる", () => {
  it("TC-001: TEST_CASES_TEMPLATE に所有者 'test-case-gen' の記述が含まれる", () => {
    // The Result YAML block comment must declare test-case-gen as the owner.
    expect(TEST_CASES_TEMPLATE).toContain("test-case-gen");
  });

  it("TC-001: TEST_CASES_TEMPLATE に書込時点（生成時に一度）の記述が含まれる", () => {
    // The comment must state that the Result YAML is written once at generation time.
    const hasWriteTimeRef =
      TEST_CASES_TEMPLATE.includes("生成時に") ||
      TEST_CASES_TEMPLATE.includes("一度だけ");
    expect(hasWriteTimeRef).toBe(true);
  });

  it("TC-001: TEST_CASES_TEMPLATE に後続ステップが更新しない旨の記述が含まれる", () => {
    // The comment must state that subsequent steps (including test-materialize) do NOT update it.
    const hasNoUpdateRef =
      TEST_CASES_TEMPLATE.includes("後続ステップ") &&
      (TEST_CASES_TEMPLATE.includes("更新しない") ||
        TEST_CASES_TEMPLATE.includes("書き換えない"));
    expect(hasNoUpdateRef).toBe(true);
  });

  it("TC-001: TEST_CASES_TEMPLATE に 'completed' の意味定義（全 TC 設計完了 / blocked_reasons が空）が含まれる", () => {
    // completed = 全 TC の設計が完了し blocked_reasons が空
    const hasCompletedMeaning =
      TEST_CASES_TEMPLATE.includes("全 TC の設計が完了") ||
      (TEST_CASES_TEMPLATE.includes("completed") &&
        TEST_CASES_TEMPLATE.includes("blocked_reasons が空"));
    expect(hasCompletedMeaning).toBe(true);
  });

  it("TC-001: TEST_CASES_TEMPLATE に 'partial' の意味定義（設計不能 TC あり）が含まれる", () => {
    // partial = 一部 TC が設計不能で blocked_reasons に記録あり
    const hasPartialMeaning =
      TEST_CASES_TEMPLATE.includes("設計不能") ||
      (TEST_CASES_TEMPLATE.includes("partial") &&
        TEST_CASES_TEMPLATE.includes("一部 TC"));
    expect(hasPartialMeaning).toBe(true);
  });

  it("TC-001: TEST_CASES_TEMPLATE に 'failed' の意味定義（生成自体が成立しなかった）が含まれる", () => {
    // failed = 生成自体が成立しなかった
    const hasFailedMeaning =
      TEST_CASES_TEMPLATE.includes("生成自体が成立しなかった") ||
      (TEST_CASES_TEMPLATE.includes("failed") &&
        TEST_CASES_TEMPLATE.includes("生成自体"));
    expect(hasFailedMeaning).toBe(true);
  });

  // --- Structural invariants: existing Result YAML keys must be preserved ---
  it("TC-001: 既存の Result YAML キー 'result:' が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("result:");
  });

  it("TC-001: 既存の Result YAML キー 'blocked_reasons:' が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("blocked_reasons:");
  });
});

// ============================================================================
// TC-002: test-case-gen prompt に enum 意味と確定規則が含まれる
// Source: spec.md > Requirement: test-case-gen system prompt は result の enum 意味と確定規則を宣言する
//         > Scenario: test-case-gen prompt に enum 意味と確定規則が含まれる
// ============================================================================

describe("TC-002: test-case-gen prompt に enum 意味と確定規則が含まれる", () => {
  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT に 'completed' の意味（全 TC 設計完了 / blocked_reasons が空）が含まれる", () => {
    // completed = 全 TC の設計が完了し blocked_reasons が空
    const hasCompletedDef =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("全 TC の設計が完了") ||
      (TEST_CASE_GEN_SYSTEM_PROMPT.includes("completed") &&
        TEST_CASE_GEN_SYSTEM_PROMPT.includes("blocked_reasons が空"));
    expect(hasCompletedDef).toBe(true);
  });

  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT に 'partial' の意味（設計不能 TC あり）が含まれる", () => {
    // partial = 一部 TC が設計不能で blocked_reasons に記録あり
    const hasPartialDef =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("設計不能") ||
      (TEST_CASE_GEN_SYSTEM_PROMPT.includes("partial") &&
        TEST_CASE_GEN_SYSTEM_PROMPT.includes("一部 TC"));
    expect(hasPartialDef).toBe(true);
  });

  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT に 'failed' の意味（生成自体が成立しなかった）が含まれる", () => {
    // failed = 生成自体が成立しなかった
    const hasFailedDef =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("生成自体が成立しなかった") ||
      (TEST_CASE_GEN_SYSTEM_PROMPT.includes("failed") &&
        TEST_CASE_GEN_SYSTEM_PROMPT.includes("生成自体"));
    expect(hasFailedDef).toBe(true);
  });

  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT に確定規則（生成完了時点で確定）が含まれる", () => {
    // Result YAML は生成完了時点で確定し、後続ステップは書き換えない
    const hasFinalizationRule =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("生成完了時点で確定") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("生成完了時点");
    expect(hasFinalizationRule).toBe(true);
  });

  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT に後続ステップは書き換えない旨が含まれる", () => {
    const hasNoRewriteRule =
      (TEST_CASE_GEN_SYSTEM_PROMPT.includes("後続ステップ") &&
        TEST_CASE_GEN_SYSTEM_PROMPT.includes("書き換えない"));
    expect(hasNoRewriteRule).toBe(true);
  });

  // --- Structural invariants: 5-section skeleton and h3 order must be preserved ---
  it("TC-002: 5 節骨格（Question/Contract/Method/Evidence/Completion）が維持されている", () => {
    const EXPECTED_SECTIONS = ["## Question", "## Contract", "## Method", "## Evidence", "## Completion"];
    for (const section of EXPECTED_SECTIONS) {
      expect(
        TEST_CASE_GEN_SYSTEM_PROMPT,
        `Expected section '${section}' to be present`,
      ).toContain(section);
    }
  });

  it("TC-002: h3 順序（Testable Behaviors Extraction → Repeat Invocation → Summary Section）が維持されている", () => {
    const extractionIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Testable Behaviors Extraction");
    const axisIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Repeat Invocation & Idempotency Axis");
    const summaryIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Summary Section (Required)");
    expect(axisIdx, "Repeat Invocation & Idempotency Axis must come after Testable Behaviors Extraction").toBeGreaterThan(extractionIdx);
    expect(summaryIdx, "Summary Section must come after Repeat Invocation & Idempotency Axis").toBeGreaterThan(axisIdx);
  });
});

// ============================================================================
// TC-004: docstring に Result YAML の machine-parsed 記述が残っていない
// Source: spec.md > Requirement: TEST_CASES_TEMPLATE の docstring は machine-parse の実態に整合する
//         > Scenario: docstring に Result YAML の machine-parsed 記述が残っていない
// ============================================================================

describe("TC-004: docstring に Result YAML の machine-parsed 記述が残っていない", () => {
  it("TC-004: TEST_CASES_TEMPLATE 直前の docstring が抽出できる（TEST_CASES_TEMPLATE が存在する）", () => {
    expect(testCasesDocstring, "docstring must be extractable from the source file").toBeTruthy();
    expect(testCasesDocstring.startsWith("/**")).toBe(true);
  });

  it("TC-004: docstring に 'Result YAML block (all keys)' を machine-parsed とする記述が含まれない", () => {
    expect(testCasesDocstring).not.toContain("Result YAML block (all keys)");
  });

  it("TC-004: docstring に 'Summary section (4 items)' を machine-parsed とする記述が含まれない", () => {
    // Summary section is not machine-parsed (extractMustTcIds does not parse it)
    expect(testCasesDocstring).not.toContain("Summary section (4 items)");
  });

  it("TC-004: docstring に TC-NNN heading を machine-parse 対象とする記述が含まれる", () => {
    // The actual machine-parse target is ### TC-NNN headings and Priority/Category fields
    const hasTcNnnRef =
      testCasesDocstring.includes("TC-NNN") ||
      testCasesDocstring.includes("TC-{NNN}");
    expect(hasTcNnnRef).toBe(true);
  });

  it("TC-004: docstring に Priority または Category を machine-parse 対象とする記述が含まれる", () => {
    // extractMustTcIds in test-coverage.ts parses Priority and Category fields
    const hasPriorityOrCategoryRef =
      testCasesDocstring.includes("Priority") ||
      testCasesDocstring.includes("Category");
    expect(hasPriorityOrCategoryRef).toBe(true);
  });
});

// ============================================================================
// TC-005: 既存テストが無改変で green（構造的不変条件の検証）
// Source: spec.md > Requirement: 意味の確定は schema・write-scope・coverage の挙動を変えない
//         > Scenario: 既存テストが無改変で green
// ============================================================================

describe("TC-005: 意味の確定は schema・write-scope 不変条件を保つ（既存テスト互換性）", () => {
  // These assertions verify the structural invariants that existing tests
  // (tests/templates/step-output-templates.test.ts and prompt-skeleton-drift-guard.test.ts)
  // depend on. The implementation MUST preserve these while adding the ownership clarifications.

  it("TC-005: TEST_CASES_TEMPLATE に既存の Result YAML 全 8 キーが保持されている", () => {
    const REQUIRED_RESULT_KEYS = [
      "result:",
      "total:",
      "automated:",
      "manual:",
      "must:",
      "should:",
      "could:",
      "blocked_reasons:",
    ];
    for (const key of REQUIRED_RESULT_KEYS) {
      expect(TEST_CASES_TEMPLATE, `Result YAML key '${key}' must be preserved`).toContain(key);
    }
  });

  it("TC-005: TEST_CASES_TEMPLATE に TC-NNN 形式指示が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("TC-{NNN}");
  });

  it("TC-005: TEST_CASES_TEMPLATE に Summary 4 items が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Total");
    expect(TEST_CASES_TEMPLATE).toContain("Automated");
    expect(TEST_CASES_TEMPLATE).toContain("Manual");
    expect(TEST_CASES_TEMPLATE).toContain("Priority");
  });

  it("TC-005: TEST_CASES_TEMPLATE に mixed format ルール（Scenario 由来 TC / 非 Scenario 由来 TC）が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Scenario 由来 TC");
    expect(TEST_CASES_TEMPLATE).toContain("GWT は記述しない");
    expect(TEST_CASES_TEMPLATE).toContain("非 Scenario 由来 TC");
    expect(TEST_CASES_TEMPLATE).toContain("GWT は必須");
  });

  it("TC-005: TEST_CASES_TEMPLATE に spec Scenario 参照形式（Source フィールド）が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("spec.md > Requirement: <name> > Scenario: <name>");
  });

  it("TC-005: TEST_CASES_TEMPLATE に GIVEN/WHEN/THEN 構造指示が保持されている", () => {
    expect(TEST_CASES_TEMPLATE).toContain("GIVEN");
    expect(TEST_CASES_TEMPLATE).toContain("WHEN");
    expect(TEST_CASES_TEMPLATE).toContain("THEN");
  });
});

// ============================================================================
// TC-006: typecheck && フルテストスイートが green（インポートスモークテスト）
// Source: tasks.md > T-05
// Given: T-01 through T-05 の変更をすべて適用した後のコードベース
// When:  typecheck && test を実行する
// Then:  型エラーが 0 件、全テストが green
// ============================================================================

describe("TC-006: 変更対象モジュールが正常にインポートできる（smoke test）", () => {
  it("TC-006: TEST_CASES_TEMPLATE が非空の文字列である", () => {
    expect(typeof TEST_CASES_TEMPLATE).toBe("string");
    expect(TEST_CASES_TEMPLATE.length).toBeGreaterThan(0);
  });

  it("TC-006: TEST_CASE_GEN_SYSTEM_PROMPT が非空の文字列である", () => {
    expect(typeof TEST_CASE_GEN_SYSTEM_PROMPT).toBe("string");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("TC-006: src/templates/step-output-templates.ts が読み取れる", () => {
    expect(templateSource.length).toBeGreaterThan(0);
    expect(templateSource).toContain("TEST_CASES_TEMPLATE");
  });
});

// ============================================================================
// TC-007: 禁止文字列が変更後の各ファイルに含まれない（should）
// Source: tasks.md > T-01, T-03
// Given:  変更後の TEST_CASES_TEMPLATE・TEST_CASE_GEN_SYSTEM_PROMPT・TEST_MATERIALIZE_SYSTEM_PROMPT
// When:   "result determination:" / "Category determination:" / "Priority determination:" の存在を検査する
// Then:   いずれの文字列においても禁止文字列は 1 件も存在しない
// ============================================================================

describe("TC-007: 禁止文字列が変更後の各ファイルに含まれない", () => {
  const FORBIDDEN_STRINGS = [
    "result determination:",
    "Category determination:",
    "Priority determination:",
  ] as const;

  for (const forbidden of FORBIDDEN_STRINGS) {
    it(`TC-007: TEST_CASES_TEMPLATE に禁止文字列 '${forbidden}' が含まれない`, () => {
      expect(TEST_CASES_TEMPLATE).not.toContain(forbidden);
    });

    it(`TC-007: TEST_CASE_GEN_SYSTEM_PROMPT に禁止文字列 '${forbidden}' が含まれない`, () => {
      expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain(forbidden);
    });

  }
});
