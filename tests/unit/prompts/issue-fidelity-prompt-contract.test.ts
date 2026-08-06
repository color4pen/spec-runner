/**
 * Prompt contract tests for issue-fidelity-system prompt (TC-012)
 *
 * TC-012: 照合 prompt の contract 文言が存在する
 *   Source: spec.md > Requirement: 照合 prompt は要件列挙・スコープ外尊重・差分ゼロ非要求の
 *           contract を持つ > Scenario: prompt contract の文言が存在する
 *
 * Asserts that the system prompt (and/or user message builder) for the issue fidelity
 * comparator contains:
 *   1. A directive to enumerate requirements from the issue
 *   2. A directive that scope-out (スコープ外) declarations are not undeclared drops
 *   3. A directive that exact match / zero-diff is NOT required
 *   4. A directive that the output must include an "undeclaredDrops" key (structured JSON)
 */
import { describe, it, expect } from "vitest";
import {
  ISSUE_FIDELITY_SYSTEM_PROMPT,
  buildIssueFidelityUserMessage,
} from "../../../src/prompts/issue-fidelity-system.js";

// ---------------------------------------------------------------------------
// TC-012: prompt contract の文言が存在する
// ---------------------------------------------------------------------------

describe("TC-012: 照合 prompt contract の文言が存在する", () => {
  it("TC-012-a: system prompt に issue 要件の列挙を指示する文言が存在する", () => {
    // Requirement: issue に明記された要件を列挙する指示
    const hasEnumerationDirective =
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("列挙") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("enumerate") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("list") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("extract");
    expect(hasEnumerationDirective).toBe(true);
  });

  it("TC-012-b: system prompt にスコープ外宣言を drop とみなさない旨の文言が存在する", () => {
    // Requirement: スコープ外宣言を尊重 = drop としない
    const hasScopeOutDirective =
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("スコープ外") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("scope") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("out-of-scope") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("out of scope");
    expect(hasScopeOutDirective).toBe(true);
  });

  it("TC-012-c: system prompt に差分ゼロ・文言一致を要求しない旨の文言が存在する", () => {
    // Requirement: 差分ゼロ・文言一致は要求しない（意味的充足で ok）
    const hasNoDiffZeroRequirement =
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("差分ゼロ") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("文言一致") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("exact match") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("verbatim") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("semantic") ||
      ISSUE_FIDELITY_SYSTEM_PROMPT.includes("意味");
    expect(hasNoDiffZeroRequirement).toBe(true);
  });

  it("TC-012-d: system prompt に undeclaredDrops を含む構造化 JSON の出力を指示する文言が存在する", () => {
    // Requirement: 出力形式は undeclaredDrops キーを含む JSON
    expect(ISSUE_FIDELITY_SYSTEM_PROMPT).toContain("undeclaredDrops");
  });

  it("TC-012-e: user message builder が issueTitle / issueBody / requestMd を埋め込む", () => {
    const msg = buildIssueFidelityUserMessage({
      issueTitle: "MY_ISSUE_TITLE_SENTINEL",
      issueBody: "MY_ISSUE_BODY_SENTINEL",
      requestMd: "MY_REQUEST_MD_SENTINEL",
    });
    expect(msg).toContain("MY_ISSUE_TITLE_SENTINEL");
    expect(msg).toContain("MY_ISSUE_BODY_SENTINEL");
    expect(msg).toContain("MY_REQUEST_MD_SENTINEL");
  });
});
