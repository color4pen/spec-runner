/**
 * Prompt contract tests for gate category classification in TEST_CASE_GEN_SYSTEM_PROMPT.
 *
 * TC-007: test-case-gen prompt に gate 定義・分類規則・GWT 省略規則が含まれる
 *
 * Source: spec.md > Requirement: test-case-gen prompt は gate 分類規則を定義する
 *           > Scenario: prompt に gate 定義と分類規則が含まれる
 *
 * RED test: intentionally fails until T-02 is implemented.
 * New file — does NOT modify tests/prompts/test-case-gen-system.test.ts.
 */
import { describe, it, expect } from "vitest";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../../src/prompts/test-case-gen-system.js";

// ---------------------------------------------------------------------------
// Helper: extract the text of a named ## section from a prompt string.
// Returns content from "## SectionName" until the next "## " heading.
// ---------------------------------------------------------------------------
function extractSection(prompt: string, sectionName: string): string {
  const lines = prompt.split("\n");
  const startRe = new RegExp(`^## ${sectionName}\\b`);
  let inSection = false;
  const sectionLines: string[] = [];
  for (const line of lines) {
    if (startRe.test(line)) {
      inSection = true;
      sectionLines.push(line);
      continue;
    }
    if (inSection && /^## /.test(line)) {
      break;
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }
  return sectionLines.join("\n");
}

// ---------------------------------------------------------------------------
// TC-007: test-case-gen prompt に gate 定義・分類規則・GWT 省略規則が含まれる
//
// Given:  TEST_CASE_GEN_SYSTEM_PROMPT を文字列として取得する
// When:   その内容を検査する
// Then:   Category の列挙に gate が含まれ、gate の定義（プロジェクト全体の検証 command の結果が
//         充足基準）と分類規則（THEN がプロジェクト全体の command の成功である TC は gate に分類する）と、
//         gate TC には GWT を書かず検証 phase を指す旨が含まれる
// ---------------------------------------------------------------------------

describe("TC-007: test-case-gen prompt に gate 定義・分類規則・GWT 省略規則が含まれる", () => {
  it("TC-007: TEST_CASE_GEN_SYSTEM_PROMPT の Category 列挙に gate が含まれる", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("gate");
  });

  it("TC-007: Category 列挙が unit | integration | manual を部分文字列として保持している（既存 TC-CATG-02 を破壊しない）", () => {
    // The existing "unit | integration | manual" substring must remain intact
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("unit | integration | manual");
  });

  it("TC-007: gate の定義（プロジェクト全体の検証 command の結果が充足基準）が含まれる", () => {
    // Must describe gate as: 充足基準がプロジェクト全体の検証 command の結果
    // (build / typecheck / lint / テストスイート全体の green、CI green 等)
    const methodSection = extractSection(TEST_CASE_GEN_SYSTEM_PROMPT, "Method");
    const hasGateDefinition =
      methodSection.includes("gate") &&
      (methodSection.includes("検証 command") ||
        methodSection.includes("verification command") ||
        methodSection.includes("build") ||
        methodSection.includes("typecheck") ||
        methodSection.includes("green"));
    expect(
      hasGateDefinition,
      "## Method section must describe gate as: 充足基準がプロジェクト全体の検証 command の結果",
    ).toBe(true);
  });

  it("TC-007: gate 分類規則（THEN がプロジェクト全体の command の成功である TC は gate に分類する）が含まれる", () => {
    // Must include a classification rule that TCs whose THEN is a project-wide
    // command success should be classified as gate (not unit/integration)
    const methodSection = extractSection(TEST_CASE_GEN_SYSTEM_PROMPT, "Method");
    const hasClassificationRule =
      methodSection.includes("gate") &&
      (methodSection.includes("分類") ||
        methodSection.includes("classify") ||
        methodSection.includes("unit / integration") ||
        methodSection.includes("unit/integration"));
    expect(
      hasClassificationRule,
      "## Method section must include the gate classification rule",
    ).toBe(true);
  });

  it("TC-007: gate TC には GWT を書かず verification phase を指す旨が含まれる", () => {
    // Must state that gate TCs should not have GWT test procedure,
    // but instead point to the verification phase name (or verification.commands command name)
    const methodSection = extractSection(TEST_CASE_GEN_SYSTEM_PROMPT, "Method");
    const hasGateGwtOmit =
      methodSection.includes("gate") &&
      (methodSection.includes("verification phase") ||
        methodSection.includes("verification.commands") ||
        methodSection.includes("phase 名") ||
        methodSection.includes("検証 phase") ||
        methodSection.includes("GWT"));
    expect(
      hasGateGwtOmit,
      "## Method section must state that gate TCs point to verification phase instead of GWT",
    ).toBe(true);
  });

  it("TC-007: 5 節骨格（Question/Contract/Method/Evidence/Completion）が維持されている", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(
        TEST_CASE_GEN_SYSTEM_PROMPT,
        `Expected section '## ${section}' to be present`,
      ).toMatch(re);
    }
  });

  it("TC-007: 5 節が Question → Contract → Method → Evidence → Completion の順序で出現する", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    const indices = EXPECTED_SECTIONS.map((name) => {
      const re = new RegExp(`## ${name}\\b`);
      return TEST_CASE_GEN_SYSTEM_PROMPT.search(re);
    });
    for (let i = 0; i < indices.length - 1; i++) {
      expect(
        indices[i],
        `'## ${EXPECTED_SECTIONS[i]}' (index ${indices[i]}) must appear before '## ${EXPECTED_SECTIONS[i + 1]}' (index ${indices[i + 1]})`,
      ).toBeLessThan(indices[i + 1]!);
    }
  });

  it("TC-007: gate 定義が ## Method 節の内側に置かれる（新規 h2 見出しを追加しない）", () => {
    const methodSection = extractSection(TEST_CASE_GEN_SYSTEM_PROMPT, "Method");
    // gate definition must be inside Method section
    expect(methodSection).toContain("gate");
    // Method section must not contain inner h2 headings introduced by gate definition
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(
      innerH2Lines,
      `Method section must not contain inner h2 headings, but found: ${JSON.stringify(innerH2Lines)}`,
    ).toHaveLength(0);
  });
});
