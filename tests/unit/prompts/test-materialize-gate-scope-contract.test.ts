/**
 * Prompt contract tests for gate TC scope exclusion in TEST_MATERIALIZE_SYSTEM_PROMPT.
 *
 * TC-008: test-materialize prompt の Method 節に gate 実体化スキップの記述が含まれる
 * TC-009: test-materialize prompt の Contract 節にツールチェーン再実行禁止の記述が含まれる
 *
 * Source:
 *   TC-008: spec.md > Requirement: test-materialize prompt は gate TC を実体化しない
 *             > Scenario: prompt に gate 実体化スキップの記述が含まれる
 *   TC-009: spec.md > Requirement: test-materialize prompt はツールチェーン再実行をテスト本体として書くことを禁止する
 *             > Scenario: prompt にツールチェーン再実行禁止の記述が含まれる
 *
 * RED tests: intentionally fail until T-03 is implemented.
 * New file — does NOT modify tests/unit/prompts/test-materialize-prompt-contract.test.ts
 *           or tests/unit/prompts/test-materialize-manual-scope-contract.test.ts.
 *
 * Discriminator note:
 *   The current prompt already contains "gate" in two contexts unrelated to gate TC classification:
 *   - "coverage gate の偽装 pass" (in the manual TC block)
 *   - "conformance / レビュー gate の管轄" (in the manual TC block)
 *   - "regression-gate" (in the PIPELINE_MAP inside the Contract section)
 *   Assertions therefore use "gate TC" or "**Category**: gate" as discriminators,
 *   since these exact phrases do NOT appear in the current prompt and WILL appear after T-03.
 *   Similarly, TC-009 checks for "テスト本体として書かない" (a specific phrase absent today).
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
// TC-008: test-materialize prompt の Method 節に gate 実体化スキップの記述が含まれる
//
// Given:  TEST_MATERIALIZE_SYSTEM_PROMPT を文字列として取得する
// When:   ## Method 節を検査する
// Then:   gate カテゴリの TC が自動テスト化・トレーサビリティコメントの対象外である旨
//         （コメントを作成しない旨および coverage 偽装 pass の禁止を含む）と、
//         その充足が verification phase の管轄である旨が含まれ、
//         Question / Contract / Method / Evidence / Completion の 5 節と順序が維持されている
// ---------------------------------------------------------------------------

describe("TC-008: test-materialize prompt の Method 節に gate 実体化スキップの記述が含まれる", () => {
  it("TC-008: ## Method 節に gate カテゴリの TC が自動テスト化の対象外である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must explicitly mention gate category TC exclusion from automated testing.
    // Uses "gate TC" or "**Category**: gate" as discriminator because the current prompt
    // already contains "gate" in other contexts (coverage gate, conformance gate).
    const hasGateExclusionRef =
      methodSection.includes("gate TC") ||
      methodSection.includes("**Category**: gate") ||
      methodSection.includes("Category: gate");
    expect(
      hasGateExclusionRef,
      "## Method section must mention 'gate TC' or '**Category**: gate' for automated testing exclusion. " +
        "Note: existing 'coverage gate' and 'conformance gate' occurrences do not satisfy this.",
    ).toBe(true);
  });

  it("TC-008: ## Method 節に gate TC にトレーサビリティコメントを付けない旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must state that traceability comments must NOT be added to gate TCs.
    // Discriminator: "gate TC" + traceability-comment-related prohibition phrase.
    const hasNoCommentForGate =
      (methodSection.includes("gate TC") || methodSection.includes("**Category**: gate")) &&
      (methodSection.includes("コメントを作成しない") ||
        methodSection.includes("コメントを付けない") ||
        methodSection.includes("コメントを追記しない") ||
        methodSection.includes("コメント") ||
        methodSection.includes("対象外") ||
        methodSection.includes("対象ではない"));
    expect(
      hasNoCommentForGate,
      "## Method section must explicitly state (using 'gate TC' or '**Category**: gate') " +
        "that traceability comments must NOT be added to gate TCs.",
    ).toBe(true);
  });

  it("TC-008: ## Method 節に gate TC の充足が verification phase の管轄である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must state that gate TC verification is handled by verification phase.
    // Discriminator: "gate TC" + "verification" or "管轄" (note: existing content has
    // "conformance / レビュー gate の管轄" but NOT "gate TC" + "verification").
    const hasVerificationPhaseRef =
      (methodSection.includes("gate TC") || methodSection.includes("**Category**: gate")) &&
      (methodSection.includes("verification phase") ||
        methodSection.includes("verification") ||
        methodSection.includes("管轄") ||
        methodSection.includes("担う"));
    expect(
      hasVerificationPhaseRef,
      "## Method section must state (using 'gate TC') that gate TC fulfillment belongs to verification phase.",
    ).toBe(true);
  });

  it("TC-008: ## Method 節に gate TC の coverage 偽装 pass 禁止の旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Must mention that a traceability comment without test implementation constitutes
    // coverage forgery for gate TCs.
    // Discriminator: "gate TC" + "偽装" (existing content has "coverage gate の偽装 pass"
    // but this is for manual TCs, not "gate TC" specifically).
    const hasCoverageForgerRef =
      (methodSection.includes("gate TC") || methodSection.includes("**Category**: gate")) &&
      (methodSection.includes("偽装") ||
        methodSection.includes("forgery") ||
        methodSection.includes("pass"));
    expect(
      hasCoverageForgerRef,
      "## Method section must mention (using 'gate TC') coverage forgery prohibition for gate TCs.",
    ).toBe(true);
  });

  it("TC-008: 5 節骨格（Question/Contract/Method/Evidence/Completion）が維持されている (regression)", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(
        TEST_MATERIALIZE_SYSTEM_PROMPT,
        `Expected section '## ${section}' to be present`,
      ).toMatch(re);
    }
  });

  it("TC-008: 5 節が Question → Contract → Method → Evidence → Completion の順序で出現する (regression)", () => {
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

  it("TC-008: gate 対象外の記述が ## Method 節の内側に置かれている（新規 h2 見出しを追加しない）(regression)", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Method section must not contain inner h2 headings (structure regression guard)
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(
      innerH2Lines,
      `Method section must not contain inner h2 headings, but found: ${JSON.stringify(innerH2Lines)}`,
    ).toHaveLength(0);
  });

  it("TC-008: gate 対象外の記述はリポジトリ固有のテストパスを参照しない (regression)", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).not.toContain("architecture/");
  });
});

// ---------------------------------------------------------------------------
// TC-009: test-materialize prompt の Contract 節にツールチェーン再実行禁止の記述が含まれる
//
// Given:  TEST_MATERIALIZE_SYSTEM_PROMPT を文字列として取得する
// When:   ## Contract 節を検査する
// Then:   プロジェクト全体の検証 command の再実行をテスト本体として書かない旨と、
//         それが gate TC として verification phase の管轄になる旨が含まれ、
//         対象挙動の検証に必要な subprocess 実行を一律には禁止しない旨が読み取れる
//
// Discriminator note:
//   The current Contract section contains "lint" (from PIPELINE_MAP: "ビルド・テスト・lint を実行し")
//   and "禁止" (from "実行は禁止"), so broad checks like (lint && 禁止) would be false positives.
//   Instead, check for "テスト本体として書かない" (or similar) and "gate TC" specifically.
// ---------------------------------------------------------------------------

describe("TC-009: test-materialize prompt の Contract 節にツールチェーン再実行禁止の記述が含まれる", () => {
  it("TC-009: ## Contract 節にプロジェクト全体の検証 command の再実行をテスト本体として書かない旨が含まれる", () => {
    const contractSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Contract");
    // Must prohibit re-running project-wide verification commands as the body of a test.
    // Discriminator: "テスト本体として書かない" or "テスト本体" with adjacent prohibition.
    // The current Contract section has "禁止" (from 変更禁止) and "lint" (from PIPELINE_MAP),
    // but NOT "テスト本体として書かない" — this phrase is the specific addition from T-03.
    const hasToolchainProhibition =
      contractSection.includes("テスト本体として書かない") ||
      contractSection.includes("テスト本体として記述しない") ||
      (contractSection.includes("テスト本体") &&
        (contractSection.includes("書かない") || contractSection.includes("記述しない")));
    expect(
      hasToolchainProhibition,
      "## Contract section must contain 'テスト本体として書かない' or equivalent phrase " +
        "prohibiting project-wide verification command re-runs as test body. " +
        "Note: existing 'lint' + '禁止' do not satisfy this (PIPELINE_MAP coincidence).",
    ).toBe(true);
  });

  it("TC-009: ## Contract 節に禁止対象が gate TC として verification phase に紐づけられている旨が含まれる", () => {
    const contractSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Contract");
    // Must state that such commands are gate TCs belonging to verification phase.
    // Discriminator: "gate TC" (not just "gate") in the Contract section.
    // The current Contract only has "regression-gate" from PIPELINE_MAP — not "gate TC".
    const hasGateVerificationRef =
      contractSection.includes("gate TC") &&
      (contractSection.includes("verification phase") ||
        contractSection.includes("verification") ||
        contractSection.includes("担う") ||
        contractSection.includes("管轄"));
    expect(
      hasGateVerificationRef,
      "## Contract section must contain 'gate TC' (not just 'gate') linked to verification phase. " +
        "Note: existing 'regression-gate' from PIPELINE_MAP does not satisfy this.",
    ).toBe(true);
  });

  it("TC-009: ## Contract 節に対象挙動の検証に必要な subprocess 実行は禁止しない旨が含まれる", () => {
    const contractSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Contract");
    // Must clarify that subprocess execution needed for testing target behavior (e.g. CLI invocation)
    // is NOT prohibited — only project-wide verification command re-runs are.
    const hasSubprocessException =
      contractSection.includes("subprocess") ||
      (contractSection.includes("CLI") &&
        (contractSection.includes("禁止しない") ||
          contractSection.includes("not prohibited") ||
          contractSection.includes("許可") ||
          contractSection.includes("必要な")));
    expect(
      hasSubprocessException,
      "## Contract section must clarify that subprocess execution for target-behavior verification is not prohibited.",
    ).toBe(true);
  });

  it("TC-009: 5 節骨格の全節が存在する (regression)", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(
        TEST_MATERIALIZE_SYSTEM_PROMPT,
        `Expected section '## ${section}' to be present`,
      ).toMatch(re);
    }
  });

  it("TC-009: Contract 節が Method 節より前に出現する (regression)", () => {
    const contractIdx = TEST_MATERIALIZE_SYSTEM_PROMPT.search(/## Contract\b/);
    const methodIdx = TEST_MATERIALIZE_SYSTEM_PROMPT.search(/## Method\b/);
    expect(contractIdx).toBeLessThan(methodIdx);
  });
});
