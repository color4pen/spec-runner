/**
 * Golden Cases — contract/golden-cases.md 対応の回帰ネット
 *
 * このファイルの目的:
 *   grounded な検査（parseFixableFindings / VerificationStep.parseResult）が
 *   将来こっそり甘くされても「落ちるべきものが通った」で検出できるよう、
 *   「絶対に通してはいけない入力」「絶対に弾いてはいけない入力」を固定する。
 *
 * Floor として既存テストが担保している部分（複製しない）:
 *   - parseReviewVerdict: approved 抽出（TC-018）→ tests/unit/parser/review-verdict.test.ts
 *   - parseReviewVerdict: 空→null（TC-021）       → tests/unit/parser/review-verdict.test.ts
 */

import { describe, it, expect } from "vitest";
import { parseFixableFindings } from "../../../src/core/parser/review-findings.js";
import { VerificationStep } from "../../../src/core/step/verification.js";
import type { StepDeps } from "../../../src/core/step/types.js";

// ---------------------------------------------------------------------------
// T-02: parseFixableFindings — golden cases
// ---------------------------------------------------------------------------

describe("golden: parseFixableFindings", () => {
  const TABLE_WITH_FIX_YES = [
    "## Findings",
    "",
    "| # | Severity | Category | File | Description | How to Fix | Fix |",
    "|---|----------|----------|------|-------------|------------|-----|",
    "| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check | yes |",
    "",
  ].join("\n");

  // must-pass: fixable な findings を含む結果で count > 0
  it("must-pass: Fix=yes の行を含む Findings テーブルで count > 0 を返す", () => {
    const result = parseFixableFindings(TABLE_WITH_FIX_YES);
    expect(result).toBeGreaterThan(0);
  });

  // must-fail-safe 1: 空文字列 → 0
  it("must-fail-safe: 空文字列で 0 を返す", () => {
    expect(parseFixableFindings("")).toBe(0);
  });

  // must-fail-safe 2: ## Findings セクションなし → 0
  it("must-fail-safe: ## Findings セクションがない文字列で 0 を返す", () => {
    const content = "# Review\n\nNo findings here.\n";
    expect(parseFixableFindings(content)).toBe(0);
  });

  // must-fail-safe 3: ## Findings テーブルに Fix 列なし → 0
  it("must-fail-safe: Fix 列がない Findings テーブルで 0 を返す（後方互換）", () => {
    const noFixCol = [
      "## Findings",
      "",
      "| # | Severity | Category | File | Description | How to Fix |",
      "|---|----------|----------|------|-------------|------------|",
      "| 1 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |",
      "",
    ].join("\n");
    expect(parseFixableFindings(noFixCol)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T-03: VerificationStep.parseResult — golden cases
// ---------------------------------------------------------------------------

describe("golden: VerificationStep.parseResult", () => {
  // 最小スタブ: parseResult が使うのは deps.slug のみ
  const minDeps = {
    slug: "test-slug",
    config: { version: 1, agents: {} },
    request: { type: "chore", title: "test", slug: "test-slug", baseBranch: "main", content: "", adr: false },
  } as unknown as StepDeps;

  // must-fail-safe: "## Verdict: failed" → verdict ≠ "passed"（= "failed"）
  it("must-fail-safe: '## Verdict: failed' を入力すると verdict が 'passed' にならない", () => {
    const result = VerificationStep.parseResult("## Verdict: failed\n", minDeps);
    expect(result.verdict).not.toBe("passed");
    expect(result.verdict).toBe("failed");
  });

  // 補強: "## Verdict: passed" → verdict = "passed"（正常パスの floor）
  it("floor: '## Verdict: passed' を入力すると verdict が 'passed' になる", () => {
    const result = VerificationStep.parseResult("## Verdict: passed\n", minDeps);
    expect(result.verdict).toBe("passed");
  });

  // 補強: verdict 行なし → verdict = null（parse 失敗時の safe default）
  it("floor: verdict 行がない場合 verdict が null になる", () => {
    const result = VerificationStep.parseResult("## Summary\n\nNo verdict here.\n", minDeps);
    expect(result.verdict).toBeNull();
  });
});
