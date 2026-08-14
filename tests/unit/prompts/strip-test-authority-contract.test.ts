/**
 * Prompt contract tests: テスト証拠と工程順序の分離(第1弾) strip-test-authority
 *
 * TC-001: red 強制の命令が prompt から消える                    [expected-red]
 * TC-002: 実行義務と観測記録要求は残る                          [expected-green]
 * TC-003: 初回 message が red 確認を課さない                    [expected-red]
 * TC-004: green 観測時の指示が理由の記録である                  [expected-red]
 *
 * Source: specrunner/changes/strip-test-authority/spec.md
 */

import { describe, it, expect } from "vitest";
import {
  TEST_MATERIALIZE_SYSTEM_PROMPT,
  buildTestMaterializeInitialMessage,
} from "../../../src/prompts/test-materialize-system.js";

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
// TC-001: red 強制の命令が prompt から消える  [expected-red]
//
// Source: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず
//         実行と観測記録のみを義務化する > Scenario: red 強制の命令が prompt から消える
//
// Discriminator: all assertions fail on the current prompt (before T-01).
//   - "書き直して" appears at line 98 ("書き直してから再実行する")
//   - "何も見張っていないテスト" appears at lines 93 and 98
//   - "green は欠陥" appears at line 93
//   - "完了不可" appears at line 98
// ---------------------------------------------------------------------------
describe("TC-001: red 強制の命令が prompt から消える", () => {
  it("TC-001: ## Method 節に「書き直して」が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: "書き直してから再実行する" is removed.
    // Currently present at line 98 → assertion fails (red) before T-01.
    expect(methodSection).not.toContain("書き直して");
  });

  it("TC-001: ## Method 節に「何も見張っていないテスト」が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: removed. Currently present at lines 93 and 98 → red before T-01.
    expect(methodSection).not.toContain("何も見張っていないテスト");
  });

  it("TC-001: ## Method 節に「green は欠陥」が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: removed. Currently present at line 93 → red before T-01.
    expect(methodSection).not.toContain("green は欠陥");
  });

  it("TC-001: ## Method 節に「完了不可」が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: "完了不可とし" is removed. Currently present at line 98 → red before T-01.
    expect(methodSection).not.toContain("完了不可");
  });
});

// ---------------------------------------------------------------------------
// TC-002: 実行義務と観測記録要求は残る  [expected-green]
//
// Source: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず
//         実行と観測記録のみを義務化する > Scenario: 実行義務と観測記録要求は残る
//
// Regression guard: these properties must survive T-01.
// All assertions pass on the current prompt (expected-green).
// ---------------------------------------------------------------------------
describe("TC-002: 実行義務と観測記録要求は残る", () => {
  it("TC-002: ## Method 節に新規テストを完了報告の前に実行する旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // "完了報告" must appear in ## Method (currently at line 96 in the impl obligation).
    expect(methodSection).toContain("完了報告");
  });

  it("TC-002: ## Method 節に実行方法が agent の裁量である旨が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // "裁量" must appear to indicate agent discretion in how to run tests.
    expect(methodSection).toContain("裁量");
  });

  it("TC-002: ## Method 節に expected-red / expected-green の分類ラベルが含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // Classification labels must remain after T-01.
    expect(methodSection).toContain("expected-red");
    expect(methodSection).toContain("expected-green");
  });

  it("TC-002: ## Evidence 節に実行したコマンドの記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    expect(evidenceSection).toContain("実行したコマンド");
  });

  it("TC-002: ## Evidence 節に対象テストファイルの記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    expect(evidenceSection).toContain("対象テストファイル");
  });

  it("TC-002: ## Evidence 節に観測結果（fail / pass の件数）の記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    expect(evidenceSection).toContain("観測結果");
  });

  it("TC-002: ## Evidence 節に期待分類（expected-red / expected-green）の記録要求が含まれる", () => {
    const evidenceSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Evidence");
    const hasClassification =
      evidenceSection.includes("expected-red") || evidenceSection.includes("expected-green");
    expect(hasClassification).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 初回 message が red 確認を課さない  [expected-red]
//
// Source: spec.md > Requirement: test-materialize prompt は red 観測の強制を課さず
//         実行と観測記録のみを義務化する > Scenario: 初回 message が red 確認を課さない
//
// Discriminator: current message at line 161 says
//   "confirm they fail (red) as expected (implementation does not yet exist)."
// After T-01 this red-forcing phrase must be absent.
// ---------------------------------------------------------------------------
describe("TC-003: 初回 message が red 確認を課さない", () => {
  const sampleMessage = buildTestMaterializeInitialMessage({
    slug: "strip-test-authority",
    branch: "change/strip-test-authority-a8e7912e",
    requestContent: "Sample request for testing initial message",
  });

  it("TC-003: 初回 message に 'confirm they fail (red)' が含まれない", () => {
    // After T-01: red-forcing phrase is removed.
    // Currently at line 161 → assertion fails (red) before T-01.
    expect(sampleMessage).not.toContain("confirm they fail (red)");
  });

  it("TC-003: 初回 message に 'fail (red) as expected' が含まれない", () => {
    // After T-01: removed. Currently present → red before T-01.
    expect(sampleMessage).not.toContain("fail (red) as expected");
  });

  it("TC-003: 初回 message に新規テストを実行し観測結果を記録してから完了する旨が含まれる", () => {
    // After T-01: a neutral instruction to run tests and record observations replaces the red-forcing text.
    // This assertion specifically checks for observation recording intent.
    // Checking for "観測" or "record" combined with completion intent.
    const hasObservationInstruction =
      sampleMessage.includes("観測") || sampleMessage.includes("record");
    expect(hasObservationInstruction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-004: green 観測時の指示が理由の記録である  [expected-red]
//
// Source: spec.md > Requirement: expected-red が green だった場合は書き直しでなく
//         理由の記録を指示する > Scenario: green 観測時の指示が理由の記録である
//
// Discriminator: current ## Method says "書き直してから再実行する" for expected-red green,
// and "理由" is absent from ## Method. After T-01 both must be fixed.
//   - "書き直してから再実行する" removed → assertion not.toContain fails currently → red
//   - "理由" added → assertion .toContain fails currently → red
// ---------------------------------------------------------------------------
describe("TC-004: green 観測時の指示が理由の記録である", () => {
  it("TC-004: expected-red が green の場合の指示に「書き直してから再実行する」が含まれない", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: "書き直してから再実行する" is replaced by observation recording instruction.
    // Currently present → assertion fails (red) before T-01.
    expect(methodSection).not.toContain("書き直してから再実行する");
  });

  it("TC-004: ## Method 節に expected-red が green だった場合の理由記録の指示が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: Method should contain "理由" as part of the observation-recording instruction
    // for the expected-red green case ("考えられる理由(既存実装が要求を満たしている..." etc.)
    // Currently "理由" is absent from ## Method → assertion fails (red) before T-01.
    expect(methodSection).toContain("理由");
  });

  it("TC-004: expected-red が green の場合の指示に Evidence への記録が含まれる", () => {
    const methodSection = extractSection(TEST_MATERIALIZE_SYSTEM_PROMPT, "Method");
    // After T-01: the instruction for expected-red green should mention recording to Evidence.
    // Currently the green-case instruction is "書き直してから再実行する" with no Evidence recording.
    // We check that after T-01, "Evidence" appears as destination for recording in Method.
    // (Currently "Evidence" already appears in "修正または再分類の根拠を Evidence に記す"
    //  but that is inside the completion-impossible block which will be removed by T-01.)
    // After T-01, a new Evidence reference for observation-recording should appear in Method.
    // Test for co-presence of "理由" and "Evidence" (neither fully present together in the
    // current "expected-red が green" instruction context) → red before T-01.
    const hasRecordInEvidence = methodSection.includes("理由") && methodSection.includes("Evidence");
    // Note: currently "理由" is absent → this fails (red) regardless of "Evidence"
    expect(hasRecordInEvidence).toBe(true);
  });
});
