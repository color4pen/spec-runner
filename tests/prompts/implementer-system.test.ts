/**
 * Unit tests for src/prompts/implementer-system.ts
 *
 * TC-012 (partial): implementer system prompt contains positive-framing workflow context in Japanese
 * Source: spec.md — Requirement: Implementer system prompt SHALL describe pipeline workflow context positively
 */
import { describe, it, expect } from "vitest";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../src/prompts/implementer-system.js";

// TC-012: implementer system prompt — workflow context in Japanese
describe("TC-012: IMPLEMENTER_SYSTEM_PROMPT — positive-framing workflow context", () => {
  it("contains 'stage 3 (implementer)' workflow position", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("stage 3");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("implementer");
  });

  it("contains 'verification' as next step", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("verification");
  });

  it("contains 'code-review' as the step after verification", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("code-review");
  });

  it("contains build/test/lint reference in next-step context", () => {
    const hasBuildTestLint =
      IMPLEMENTER_SYSTEM_PROMPT.includes("build/test/lint") ||
      (IMPLEMENTER_SYSTEM_PROMPT.includes("build") &&
        IMPLEMENTER_SYSTEM_PROMPT.includes("test") &&
        IMPLEMENTER_SYSTEM_PROMPT.includes("lint"));
    expect(hasBuildTestLint).toBe(true);
  });

  it("uses positive framing 'hand off to verification' style (次工程に渡す or equivalent)", () => {
    const hasPositiveFraming =
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程に渡してください") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("渡して");
    expect(hasPositiveFraming).toBe(true);
  });

  it("does not use only negative framing ('Do not run tests yourself' style only)", () => {
    // Must have positive framing — purely negative is insufficient per spec
    // "Do not run tests yourself" alone would not satisfy the requirement
    // Check that positive direction exists
    const hasPositive =
      IMPLEMENTER_SYSTEM_PROMPT.includes("次工程") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("渡して") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("hand off");
    expect(hasPositive).toBe(true);
  });
});

// TC-022: implementer prompt に TC ID 記載規律が含まれる
describe("TC-022: IMPLEMENTER_SYSTEM_PROMPT — TC ID 記載規律", () => {
  it("TC ID を test 関数名 / comment に記載する規律が含まれる", () => {
    const hasRule =
      IMPLEMENTER_SYSTEM_PROMPT.includes("TC ID") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("TC-");
    expect(hasRule).toBe(true);
  });

  it("TC-070 またはそれに準じる形式の例示が含まれる", () => {
    // The prompt must contain an example like `it("TC-070: ...")`
    const hasExample =
      IMPLEMENTER_SYSTEM_PROMPT.includes("TC-070") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes('it("TC-');
    expect(hasExample).toBe(true);
  });

  it("後続の verification step が grep で TC ID を検証する旨が明記されている", () => {
    const hasVerificationRef =
      IMPLEMENTER_SYSTEM_PROMPT.includes("verification") &&
      IMPLEMENTER_SYSTEM_PROMPT.includes("grep");
    expect(hasVerificationRef).toBe(true);
  });
});

describe("IMPLEMENTER_SYSTEM_PROMPT — basic requirements", () => {
  it("is a non-empty string", () => {
    expect(typeof IMPLEMENTER_SYSTEM_PROMPT).toBe("string");
    expect(IMPLEMENTER_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it("still contains role/task definitions", () => {
    // Core implementer identity must remain
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("implementer");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("tasks.md");
  });

  it("contains neutral finish instruction instead of commit + push (StepExecutor handles commit+push)", () => {
    // Provider-neutral: "実装が完了したら作業を終える" or equivalent
    const hasFinishInstruction =
      IMPLEMENTER_SYSTEM_PROMPT.includes("作業を終える") ||
      IMPLEMENTER_SYSTEM_PROMPT.includes("完了結果を報告");
    expect(hasFinishInstruction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005 (test-dir-detection): IMPLEMENTER_SYSTEM_PROMPT に tests/ 固定 grep 表現がない
// Source: test-cases.md TC-005 — implementer プロンプトに tests/ 固定 grep の記述がない
// ---------------------------------------------------------------------------
describe("TC-005: IMPLEMENTER_SYSTEM_PROMPT — tests/ 固定 grep 表現が含まれない", () => {
  it("verification step の説明に tests/ 配下固定のディレクトリパスが含まれない", () => {
    // Old text: "verification step が `tests/` 配下に対する grep で TC ID の存在を機械的に検証する"
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("tests/ 配下に対する grep");
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("tests/ 配下への grep");
  });

  it("verification step の説明がプロジェクト内の *.test.ts / *.spec.ts を参照している", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("*.test.ts");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("*.spec.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-011 (test-dir-detection): IMPLEMENTER_SYSTEM_PROMPT に既存テスト配置パターンに従う旨のガイダンスが含まれる
// Source: test-cases.md TC-011 — IMPLEMENTER_SYSTEM_PROMPT に既存 test 配置パターンに従う旨のガイダンスが含まれる
// ---------------------------------------------------------------------------
describe("TC-011: IMPLEMENTER_SYSTEM_PROMPT — 既存テスト配置パターンに従うガイダンスが含まれる", () => {
  it("テストの配置先はプロジェクトの既存テスト配置パターンに従う旨が含まれる", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("既存テストの配置パターンに従う");
  });

  it("特定ディレクトリを指定しない旨の説明が含まれる", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("特定ディレクトリを指定しない");
  });
});

// ---------------------------------------------------------------------------
// TC-007: implementer system prompt に delta spec Scenario 参照フローが記載されている
// Source: tasks.md > T-03: implementer system prompt を delta spec Scenario 参照フローに更新
// ---------------------------------------------------------------------------
describe("TC-007: IMPLEMENTER_SYSTEM_PROMPT — delta spec Scenario reference flow", () => {
  it("Scenario-derived TC flow: instructs to read Source path from delta spec", () => {
    // Must instruct implementer to open specs/<capability>/spec.md via Read tool
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("Scenario 由来 TC");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("specs/<capability>/spec.md");
  });

  it("Scenario-derived TC flow: instructs to read Scenario GWT from delta spec", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("Read tool");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("GIVEN/WHEN/THEN");
  });

  it("non-Scenario-derived TC flow: instructs to use GWT from test-cases.md", () => {
    // Must preserve the old flow for non-Scenario TCs
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("非 Scenario 由来 TC");
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("test-cases.md");
  });
});
