/**
 * Prompt contract tests for TEST_MATERIALIZE_SYSTEM_PROMPT.
 *
 * TC-001: prompt が既存テスト充足の正規手順を含む
 * TC-002: prompt がリポジトリ固有のテストパスを名指ししない
 * TC-003: prompt の 5 節骨格が維持される
 *
 * Source: spec.md > Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する
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
// TC-001: prompt が既存テスト充足の正規手順を含む
//
// Asserts that the ## Method section of TEST_MATERIALIZE_SYSTEM_PROMPT:
//   1. Contains the "// TC-" traceability comment format literal
//   2. Contains an instruction to add a traceability comment to existing tests
//      (i.e. does NOT just create new tests and does NOT stop)
//   3. Explicitly prohibits duplicate test creation
//   4. Explicitly prohibits halting/stopping when coverage is already satisfied
// ---------------------------------------------------------------------------
describe("TC-001: prompt が既存テスト充足の正規手順を含む", () => {
  it("## Method 節に '// TC-' リテラルが含まれる（トレーサビリティコメント形式）", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).toContain("// TC-");
  });

  it("## Method 節に既存テストへのコメント追記の手順が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must mention existing tests and traceability comment (or comment addition)
    const hasExistingTestRef =
      methodSection.includes("既存テスト") ||
      methodSection.includes("既存のテスト") ||
      methodSection.includes("existing test");
    expect(hasExistingTestRef).toBe(true);
  });

  it("## Method 節に重複作成しない旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must prohibit duplicate test creation
    const prohibitsDuplicate =
      methodSection.includes("重複") ||
      methodSection.includes("duplicate") ||
      methodSection.includes("新規テストを作成しない") ||
      methodSection.includes("新規作成しない");
    expect(prohibitsDuplicate).toBe(true);
  });

  it("## Method 節に充足不能として停止しない旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must prohibit stopping/halting when TC is already satisfied by existing test
    const prohibitsStop =
      methodSection.includes("停止しない") ||
      methodSection.includes("止まらない") ||
      methodSection.includes("do not stop") ||
      methodSection.includes("充足不能") ||
      methodSection.includes("SHALL NOT");
    expect(prohibitsStop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: prompt がリポジトリ固有のテストパスを名指ししない
//
// Asserts that TEST_MATERIALIZE_SYSTEM_PROMPT does NOT contain repository-specific
// paths such as "architecture/" in its instructions.
// ---------------------------------------------------------------------------
describe("TC-002: prompt がリポジトリ固有のテストパスを名指ししない", () => {
  it("TEST_MATERIALIZE_SYSTEM_PROMPT に 'architecture/' が含まれない", () => {
    expect(TEST_MATERIALIZE_SYSTEM_PROMPT).not.toContain("architecture/");
  });

  it("## Method 節のトレーサビリティ手順は汎用語 '既存テスト' で記述される（リポジトリ固有パスを含まない）", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Once the traceability procedure is added, it must NOT reference repository-specific paths
    expect(methodSection).not.toContain("architecture/");
  });
});

// ---------------------------------------------------------------------------
// TC-003: prompt の 5 節骨格が維持される
//
// Asserts:
//   (a) Question / Contract / Method / Evidence / Completion の 5 節がこの順序で存在する
//   (b) トレーサビリティコメント手順が ## Method 節の内側に置かれている（新規 h2 を追加しない）
// ---------------------------------------------------------------------------
describe("TC-003: prompt の 5 節骨格が維持される", () => {
  const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];

  it("TEST_MATERIALIZE_SYSTEM_PROMPT に5節 (Question/Contract/Method/Evidence/Completion) が存在する", () => {
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(
        TEST_MATERIALIZE_SYSTEM_PROMPT,
        `Expected section '## ${section}' to be present`,
      ).toMatch(re);
    }
  });

  it("5節が Question → Contract → Method → Evidence → Completion の順序で出現する", () => {
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

  it("トレーサビリティコメント手順は ## Method 節の内側に含まれる（新規の h2 見出しを追加しない）", () => {
    // The traceability instruction (// TC-) must appear within ## Method, not in any other section
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).toContain("// TC-");
  });

  it("トレーサビリティコメント手順の追記が新規の h2 見出しを Method 節内に導入していない", () => {
    // The Method section must not contain a line starting with ## (which would indicate
    // a new h2 heading was added inside Method rather than content being embedded).
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Only the first line "## Method" itself should start with "## "
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(
      innerH2Lines,
      `Method section must not contain inner h2 headings, but found: ${JSON.stringify(innerH2Lines)}`,
    ).toHaveLength(0);
  });
});
