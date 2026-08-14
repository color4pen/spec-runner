/**
 * Prompt contract tests: test-materialize の観測記録義務（工程順序由来の権威を撤回済み）
 *
 * TC-001: red 強制の命令が prompt に含まれない              [expected-green after strip-test-authority]
 * TC-002: prompt に期待分類と観測記録の指示が含まれる        [expected-green]
 * TC-003: Evidence 節に観測記録の指示が含まれる              [expected-green]
 * TC-004: 既存の manual/gate/traceability/skeleton 契約が無改変で green [expected-green]
 * TC-005: Evidence 節が "result file" を記録先として名指ししない [expected-green / guard]
 *
 * Source: specrunner/changes/test-materialize-red-check/test-cases.md
 *        + specrunner/changes/strip-test-authority/design.md D5
 *
 * strip-test-authority による更新(D5 #1-#5):
 *   - TC-001「書き直して再実行する旨が含まれる」→「含まれない」に反転
 *   - TC-002「green は欠陥である旨が含まれる」→「含まれない」に反転
 *   - TC-002「完了不可とする旨が含まれる」→「含まれない」に反転
 *   - TC-002「修正または再分類の根拠を Evidence に記す旨」→ green 観測時の理由記録指示に変更
 *   - docstring を反転後の意味(権威撤回・観測記録維持)に更新
 *
 * 維持対象(無改変で green):
 *   TC-001: 完了報告 / 観測 / 裁量 / 5 節骨格の各テスト
 *   TC-002: expected-red / expected-green ラベル・expected-green は green が正常
 *   TC-003 全体 / TC-004 全体 / TC-005
 *
 * Not modified:
 *   tests/unit/prompts/test-materialize-prompt-contract.test.ts
 *   tests/unit/prompts/test-materialize-manual-scope-contract.test.ts
 *   tests/unit/prompts/test-materialize-gate-scope-contract.test.ts
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
// TC-001: prompt に実行と red 観測の指示が含まれる  [expected-red]
//
// Source: spec.md > Requirement: test-materialize prompt は新規テストの実行と fail 観測を義務化する
//           > Scenario: prompt に実行と red 観測の指示が含まれる
//
// All assertions below fail on the current prompt (before T-01).
// ---------------------------------------------------------------------------
describe("TC-001: prompt に実行と red 観測の指示が含まれる", () => {
  it("TC-001: ## Method 節に新規テストを完了報告の前に実行する旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // "完了報告" must appear in ## Method after T-01.
    // Currently "完了報告" only appears in ## Completion — not in ## Method.
    expect(methodSection).toContain("完了報告");
  });

  it("TC-001: ## Method 節に fail（red）を観測してから完了する旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // "観測" is the key discriminator. Current Step 6 says "red（fail）で構わない",
    // which does NOT contain "観測". After T-01, Step 6 must contain "観測".
    expect(methodSection).toContain("観測");
  });

  it("TC-001: ## Method 節に fail しなかった新挙動テストは書き直して再実行する旨が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // strip-test-authority D5 #1: "書き直して" / "何も見張っていないテスト" を ## Method から削除。
    // Before strip-test-authority: 含まれていた。After: 含まれない。
    const hasRewrite =
      methodSection.includes("書き直して") || methodSection.includes("何も見張っていないテスト");
    expect(hasRewrite).toBe(false);
  });

  it("TC-001: ## Method 節に実行方法が agent の裁量である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // "裁量" — not present in current ## Method section.
    expect(methodSection).toContain("裁量");
  });

  it("TC-001: 5 節骨格（Question/Contract/Method/Evidence/Completion）と順序が維持されている", () => {
    const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(TEST_MATERIALIZE_SYSTEM_PROMPT, `Expected section '## ${section}'`).toMatch(re);
    }
    const indices = EXPECTED_SECTIONS.map((name) =>
      TEST_MATERIALIZE_SYSTEM_PROMPT.search(new RegExp(`## ${name}\\b`)),
    );
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]!);
    }
  });

  it("TC-001: Method 節に新規 h2 見出しが追加されていない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(
      innerH2Lines,
      `Method section must not contain inner h2 headings, found: ${JSON.stringify(innerH2Lines)}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-002: prompt に期待分類と一致確認の指示が含まれる  [expected-red]
//
// Source: spec.md > Requirement: test-materialize prompt は expected-red / expected-green の
//           期待分類と一致確認を規定する > Scenario: prompt に期待分類と一致確認の指示が含まれる
//
// Discriminator: "expected-red" / "expected-green" are absent from the current prompt entirely.
// ---------------------------------------------------------------------------
describe("TC-002: prompt に期待分類と一致確認の指示が含まれる", () => {
  it("TC-002: ## Method 節に 'expected-red' リテラルが含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).toContain("expected-red");
  });

  it("TC-002: ## Method 節に 'expected-green' リテラルが含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).toContain("expected-green");
  });

  it("TC-002: ## Method 節に expected-red は base で green が欠陥である旨が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // strip-test-authority D5 #2: "green は欠陥" の権威句を削除。
    // Before strip-test-authority: 含まれていた。After: 含まれない。
    const hasGreenIsDefect =
      methodSection.includes("green は欠陥") ||
      methodSection.includes("green が欠陥") ||
      (methodSection.includes("expected-red") && methodSection.includes("欠陥"));
    expect(hasGreenIsDefect).toBe(false);
  });

  it("TC-002: ## Method 節に expected-green は base で green が正常である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const hasGreenNormal =
      methodSection.includes("expected-green") &&
      (methodSection.includes("green が正常") || methodSection.includes("green は正常"));
    expect(hasGreenNormal).toBe(true);
  });

  it("TC-002: ## Method 節に期待と観測の不一致は完了不可とする旨が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // strip-test-authority D5 #3: "完了不可" の権威句を削除。
    // Before strip-test-authority: 含まれていた。After: 含まれない。
    const hasCompletionBlock =
      methodSection.includes("完了不可") ||
      (methodSection.includes("不一致") && methodSection.includes("完了"));
    expect(hasCompletionBlock).toBe(false);
  });

  it("TC-002: ## Method 節に green 観測時の理由を Evidence に記録する指示が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // strip-test-authority D5 #4: 「書き直し/再分類」から「観測事実と理由の Evidence への記録」に変更。
    // 「理由」と「Evidence」または「記録」が共存すること。
    const hasEvidenceRef =
      methodSection.includes("理由") &&
      (methodSection.includes("Evidence") || methodSection.includes("記録"));
    expect(hasEvidenceRef).toBe(true);
  });

  it("TC-002: Method 節に新規 h2 見出しが追加されていない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(innerH2Lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-003: Evidence 節に観測記録の指示が含まれる  [expected-red]
//
// Source: spec.md > Requirement: test-materialize prompt の Evidence 要求は実行観測記録を義務化する
//           > Scenario: Evidence 節に観測記録の指示が含まれる
//
// Discriminators: "実行したコマンド", "対象テストファイル", "観測結果", and
//   "expected-red"/"expected-green" are all absent from the current Evidence section.
//   Note: EVIDENCE_DISCIPLINE (shared fragment) has "コマンド" but not "実行したコマンド"
//   as a test-execution recording requirement — those are distinct occurrences.
// ---------------------------------------------------------------------------
describe("TC-003: Evidence 節に観測記録の指示が含まれる", () => {
  it("TC-003: ## Evidence 節に実行したコマンドの記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    // Must require recording the test execution command.
    // "実行したコマンド" is absent from current Evidence — EVIDENCE_DISCIPLINE has
    // "確認に使ったコマンド" (evidence classification), which is a different concept.
    expect(evidenceSection).toContain("実行したコマンド");
  });

  it("TC-003: ## Evidence 節に対象テストファイルの記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    // "対象テストファイル" — not in current Evidence section.
    expect(evidenceSection).toContain("対象テストファイル");
  });

  it("TC-003: ## Evidence 節に観測結果（fail / pass の件数）の記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    // "観測結果" — not in current Evidence section.
    expect(evidenceSection).toContain("観測結果");
  });

  it("TC-003: ## Evidence 節に期待分類（expected-red / expected-green）の記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    // Key discriminator: "expected-red" / "expected-green" absent from current Evidence.
    const hasClassification =
      evidenceSection.includes("expected-red") || evidenceSection.includes("expected-green");
    expect(hasClassification).toBe(true);
  });

  it("TC-003: ## Evidence 節に既存の TC ID 列挙要求が残存している（回帰確認）", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    // Existing requirement must NOT be removed by T-02.
    const hasExistingTcEvidence =
      evidenceSection.includes("TC ID") || evidenceSection.includes("変換した TC");
    expect(hasExistingTcEvidence).toBe(true);
  });

  it("TC-003: Evidence 節に新規 h2 見出しが追加されていない", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    const innerH2Lines = evidenceSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(innerH2Lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 既存の manual / gate / traceability / skeleton 契約が無改変で green  [expected-green]
//
// Source: spec.md > Requirement: 既存の test-materialize prompt 契約が回帰しない
//           > Scenario: 既存の manual / gate / traceability / skeleton 契約が無改変で green
//
// NOTE: The primary tests for this TC live in the existing test files:
//   - test-materialize-prompt-contract.test.ts
//   - test-materialize-manual-scope-contract.test.ts
//   - test-materialize-gate-scope-contract.test.ts
// This test reinforces the same invariants as a regression guard in the new file.
// Expected-green: should pass both before and after T-01/T-02.
// ---------------------------------------------------------------------------
describe("TC-004: 既存の manual / gate / traceability / skeleton 契約が無改変で green", () => {
  const EXPECTED_SECTIONS = ["Question", "Contract", "Method", "Evidence", "Completion"];

  it("TC-004: 5 節（Question/Contract/Method/Evidence/Completion）が存在する", () => {
    for (const section of EXPECTED_SECTIONS) {
      const re = new RegExp(`^## ${section}\\b`, "m");
      expect(TEST_MATERIALIZE_SYSTEM_PROMPT, `Expected section '## ${section}'`).toMatch(re);
    }
  });

  it("TC-004: 5 節が Question → Contract → Method → Evidence → Completion の順序で出現する", () => {
    const indices = EXPECTED_SECTIONS.map((name) =>
      TEST_MATERIALIZE_SYSTEM_PROMPT.search(new RegExp(`## ${name}\\b`)),
    );
    for (let i = 0; i < indices.length - 1; i++) {
      expect(
        indices[i],
        `'## ${EXPECTED_SECTIONS[i]}' must appear before '## ${EXPECTED_SECTIONS[i + 1]}'`,
      ).toBeLessThan(indices[i + 1]!);
    }
  });

  it("TC-004: ## Method 節に '// TC-' トレーサビリティコメント形式が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).toContain("// TC-");
  });

  it("TC-004: ## Method 節に重複テスト作成禁止の旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const prohibitsDuplicate =
      methodSection.includes("重複") ||
      methodSection.includes("duplicate") ||
      methodSection.includes("新規テストを作成しない") ||
      methodSection.includes("新規作成しない");
    expect(prohibitsDuplicate).toBe(true);
  });

  it("TC-004: ## Method 節に manual TC の扱いが記述されている", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const hasManual =
      methodSection.includes("**Category**: manual") ||
      methodSection.includes("Category: manual");
    expect(hasManual).toBe(true);
  });

  it("TC-004: ## Method 節に gate TC の扱いが記述されている", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const hasGate =
      methodSection.includes("gate TC") || methodSection.includes("**Category**: gate");
    expect(hasGate).toBe(true);
  });

  it("TC-004: リポジトリ固有のテストパスが Method 節に含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    expect(methodSection).not.toContain("architecture/");
  });

  it("TC-004: Method 節に新規 h2 見出しが追加されていない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    const innerH2Lines = methodSection.split("\n").slice(1).filter((l) => /^## /.test(l));
    expect(innerH2Lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: Evidence 節が "result file" を記録先として名指ししない  [expected-green / guard]
//
// Source: design.md > D3: 観測記録を Evidence 節の step 固有要求に追加する（記録先は完了報告）
//
// GIVEN: TEST_MATERIALIZE_SYSTEM_PROMPT を文字列として取得する
// WHEN:  ## Evidence 節を検査する
// THEN:  "result file" を記録先として名指しする文言が Evidence 節に含まれない
//
// This is a "shall NOT contain" guard. The current prompt already satisfies it.
// Expected-green: prevents T-02 from accidentally adding "result file" as a recording target.
// ---------------------------------------------------------------------------
describe('TC-005: Evidence 節が "result file" を記録先として名指ししない', () => {
  it('TC-005: ## Evidence 節に "result file" を記録先として名指しする文言が含まれない', () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    expect(evidenceSection).not.toContain("result file");
  });
});
