/**
 * Prompt contract tests for manual TC scope exclusion in TEST_MATERIALIZE_SYSTEM_PROMPT.
 *
 * TC-003: prompt が manual TC 対象外の記述を含む
 *
 * Source: spec.md > Requirement: test-materialize prompt は manual TC を
 *   自動テスト化・トレーサビリティコメントの対象外とする
 *   > Scenario: prompt が manual TC 対象外の記述を含む
 *
 * This test is intentionally red until T-02 (prompt update) is implemented.
 * New file — does NOT modify tests/unit/prompts/test-materialize-prompt-contract.test.ts.
 */
import { describe, it, expect } from "vitest";
import { TEST_MATERIALIZE_SYSTEM_PROMPT } from "../../../src/prompts/test-materialize-system.js";

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
// TC-003: prompt が manual TC 対象外の記述を含む
//
// Given:  TEST_MATERIALIZE_SYSTEM_PROMPT を文字列として取得する
// When:   ## Method 節を検査する
// Then:   manual カテゴリの TC が自動テスト化・トレーサビリティコメントの対象外である旨
//         （コメントを作成しない旨を含む）が含まれ、
//         Question / Contract / Method / Evidence / Completion の 5 節と順序が維持されている
// ---------------------------------------------------------------------------

describe("TC-003: prompt が manual TC 対象外の記述を含む", () => {
  it("## Method 節に manual カテゴリの TC が自動テスト化の対象外である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must state that manual TCs are NOT subject to automated test creation
    const hasManualExclusionRef =
      methodSection.includes("manual") ||
      methodSection.includes("Category: manual") ||
      methodSection.includes("**Category**: manual");
    expect(
      hasManualExclusionRef,
      "## Method section must mention manual category TC exclusion",
    ).toBe(true);
  });

  it("## Method 節に manual TC にトレーサビリティコメントを付けない旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must state that traceability comments must NOT be added to manual TCs
    // because there is no test implementation behind them (gate forgery)
    const hasNoCommentRef =
      methodSection.includes("コメントを作成しない") ||
      methodSection.includes("コメントを付けない") ||
      methodSection.includes("コメントを追記しない") ||
      methodSection.includes("do not add") ||
      methodSection.includes("SHALL NOT") ||
      methodSection.includes("対象外") ||
      methodSection.includes("not subject");
    expect(
      hasNoCommentRef,
      "## Method section must state that traceability comments must NOT be added to manual TCs",
    ).toBe(true);
  });

  it("## Method 節に manual TC の検証が conformance / レビュー gate の管轄である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must state that manual TC verification is handled by conformance/review gates
    const hasConformanceRef =
      methodSection.includes("conformance") ||
      methodSection.includes("レビュー") ||
      methodSection.includes("review") ||
      methodSection.includes("gate");
    expect(
      hasConformanceRef,
      "## Method section must state that manual TC verification belongs to conformance/review gate",
    ).toBe(true);
  });

  it("5 節骨格（Question/Contract/Method/Evidence/Completion）が維持されている", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(
        TEST_MATERIALIZE_SYSTEM_PROMPT,
        `Expected section '## ${section}' to be present`,
      ).toMatch(re);
    }
  });

  it("5 節が Question → Contract → Method → Evidence → Completion の順序で出現する", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    const indices = EXPECTED_SECTIONS.map((name) => {
      const re = new RegExp(`## ${name}\\b`);
      return TEST_MATERIALIZE_SYSTEM_PROMPT.search(re);
    });
    for (let i = 0; i < indices.length - 1; i++) {
      expect(
        indices[i],
        `'## ${EXPECTED_SECTIONS[i]}' (index ${indices[i]}) must appear before '## ${EXPECTED_SECTIONS[i + 1]}' (index ${indices[i + 1]})`,
      ).toBeLessThan(indices[i + 1]!);
    }
  });

  it("manual 対象外の記述が ## Method 節の内側に置かれている（新規 h2 見出しを追加しない）", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Method section must not contain inner h2 headings
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(
      innerH2Lines,
      `Method section must not contain inner h2 headings, but found: ${JSON.stringify(innerH2Lines)}`,
    ).toHaveLength(0);
  });

  it("manual TC 対象外の記述はリポジトリ固有のテストパスを参照しない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must not reference repository-specific paths like "architecture/"
    expect(methodSection).not.toContain("architecture/");
  });
});
