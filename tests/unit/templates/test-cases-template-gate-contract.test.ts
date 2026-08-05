/**
 * Template contract tests for gate category in TEST_CASES_TEMPLATE.
 *
 * TC-010: TEST_CASES_TEMPLATE の Category 行が gate を含む
 *
 * Source: spec.md > Requirement: template / docs は gate 分類を明文化する
 *           > Scenario: TEST_CASES_TEMPLATE の Category 行が gate を含む
 *
 * RED test: intentionally fails until T-04 is implemented.
 * New file — does NOT modify tests/templates/step-output-templates.test.ts.
 */
import { describe, it, expect } from "vitest";
import { TEST_CASES_TEMPLATE } from "../../../src/templates/step-output-templates.js";

// ---------------------------------------------------------------------------
// TC-010: TEST_CASES_TEMPLATE の Category 行が gate を含む
//
// Given:  TEST_CASES_TEMPLATE を文字列として取得する
// When:   その内容を検査する
// Then:   Category 必須フィールドの列挙に gate が含まれ、
//         unit | integration | manual の既存列挙も部分文字列として保持されている
// ---------------------------------------------------------------------------

describe("TC-010: TEST_CASES_TEMPLATE の Category 行が gate を含む", () => {
  it("TC-010: TEST_CASES_TEMPLATE の Category 必須フィールド行に gate が含まれる", () => {
    expect(TEST_CASES_TEMPLATE).toContain("gate");
  });

  it("TC-010: TEST_CASES_TEMPLATE に既存の 'unit | integration | manual' 列挙が部分文字列として残っている（回帰なし）", () => {
    expect(TEST_CASES_TEMPLATE).toContain("unit | integration | manual");
  });

  it("TC-010: TEST_CASES_TEMPLATE の Category 列挙が unit | integration | manual | gate を含む形になっている", () => {
    // The Category field must be updated to include gate after the existing values
    expect(TEST_CASES_TEMPLATE).toContain("unit | integration | manual | gate");
  });

  it("TC-010: TEST_CASES_TEMPLATE の既存 TC-NNN format 指示が維持されている（回帰なし）", () => {
    expect(TEST_CASES_TEMPLATE).toContain("TC-{NNN}");
  });

  it("TC-010: TEST_CASES_TEMPLATE の既存 mixed format 記述が維持されている（回帰なし）", () => {
    expect(TEST_CASES_TEMPLATE).toContain("mixed format");
  });

  it("TC-010: TEST_CASES_TEMPLATE の既存 Scenario 由来 TC の GWT 省略規則が維持されている（回帰なし）", () => {
    expect(TEST_CASES_TEMPLATE).toContain("Scenario 由来 TC");
    expect(TEST_CASES_TEMPLATE).toContain("GWT は記述しない");
  });

  it("TC-010: TEST_CASES_TEMPLATE の HTML コメントに gate TC の形式説明が含まれる", () => {
    // The HTML comment should describe gate TC format:
    // no GWT, record verification phase name instead
    const hasGateFormat =
      TEST_CASES_TEMPLATE.includes("gate") &&
      (TEST_CASES_TEMPLATE.includes("verification phase") ||
        TEST_CASES_TEMPLATE.includes("検証 phase") ||
        TEST_CASES_TEMPLATE.includes("phase 名") ||
        TEST_CASES_TEMPLATE.includes("GWT"));
    expect(
      hasGateFormat,
      "TEST_CASES_TEMPLATE HTML comment must describe gate TC format (no GWT, record verification phase)",
    ).toBe(true);
  });

  it("TC-010: TEST_CASES_TEMPLATE の Result YAML キーが維持されている（回帰なし）", () => {
    expect(TEST_CASES_TEMPLATE).toContain("result:");
    expect(TEST_CASES_TEMPLATE).toContain("total:");
    expect(TEST_CASES_TEMPLATE).toContain("automated:");
    expect(TEST_CASES_TEMPLATE).toContain("manual:");
    expect(TEST_CASES_TEMPLATE).toContain("must:");
    expect(TEST_CASES_TEMPLATE).toContain("blocked_reasons:");
  });
});
