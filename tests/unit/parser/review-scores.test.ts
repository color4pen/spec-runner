/**
 * Unit tests for parseReviewScores
 *
 * TC-RS-001: Scores セクションのテーブルと total 行を正常パースする (must)
 * TC-RS-002: ## Scores セクションが存在しない場合は null を返す (must)
 * TC-RS-003: total 行が存在しない場合は null を返す (must)
 * TC-RS-004: Score 値が数値でない場合は null を返す (must)
 * TC-RS-005: カテゴリが 0 行のテーブルでも total があれば結果を返す (must)
 */
import { describe, it, expect } from "vitest";
import { parseReviewScores } from "../../../src/core/parser/review-scores.js";

const VALID_SCORES_CONTENT = `# Code Review Feedback

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.8

## Summary

Looks good.
`;

// TC-RS-001: 正常パース
describe("TC-RS-001: Scores セクションのテーブルと total 行を正常パースする", () => {
  it("returns ReviewScores with all 6 categories", () => {
    const result = parseReviewScores(VALID_SCORES_CONTENT);
    expect(result).not.toBeNull();
    expect(result!.categories).toBeDefined();
    expect(Object.keys(result!.categories)).toHaveLength(6);
  });

  it("parses category scores correctly", () => {
    const result = parseReviewScores(VALID_SCORES_CONTENT);
    expect(result!.categories["correctness"]).toEqual({ score: 8, weight: 0.30 });
    expect(result!.categories["security"]).toEqual({ score: 9, weight: 0.25 });
    expect(result!.categories["architecture"]).toEqual({ score: 7, weight: 0.15 });
    expect(result!.categories["performance"]).toEqual({ score: 8, weight: 0.10 });
    expect(result!.categories["maintainability"]).toEqual({ score: 7, weight: 0.10 });
    expect(result!.categories["testing"]).toEqual({ score: 6, weight: 0.10 });
  });

  it("parses total correctly", () => {
    const result = parseReviewScores(VALID_SCORES_CONTENT);
    expect(result!.total).toBe(7.8);
  });
});

// TC-RS-002: テーブルなし
describe("TC-RS-002: ## Scores セクションが存在しない場合は null を返す", () => {
  it("returns null when no ## Scores section", () => {
    const content = `# Code Review

- **verdict**: approved

## Summary

No scores here.
`;
    expect(parseReviewScores(content)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseReviewScores("")).toBeNull();
  });
});

// TC-RS-003: total なし
describe("TC-RS-003: total 行が存在しない場合は null を返す", () => {
  it("returns null when Scores section exists but no total line", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |

`;
    expect(parseReviewScores(content)).toBeNull();
  });
});

// TC-RS-004: 不正な Score 値
describe("TC-RS-004: Score 値が数値でない場合は null を返す", () => {
  it("returns null when a score value is not a number", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | N/A | 0.30 |
| security | 9 | 0.25 |

- **total**: 7.0
`;
    expect(parseReviewScores(content)).toBeNull();
  });

  it("returns null when weight value is not a number", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | high |
| security | 9 | 0.25 |

- **total**: 7.0
`;
    expect(parseReviewScores(content)).toBeNull();
  });
});

// TC-RS-005: カテゴリ 0 行
describe("TC-RS-005: カテゴリが 0 行のテーブルでも total があれば結果を返す", () => {
  it("returns ReviewScores with empty categories when table has only header rows", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|

- **total**: 0
`;
    const result = parseReviewScores(content);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.categories)).toHaveLength(0);
    expect(result!.total).toBe(0);
  });
});

// Additional: integer total
describe("parseReviewScores — additional edge cases", () => {
  it("parses integer total (no decimal)", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 7 | 0.30 |

- **total**: 7
`;
    const result = parseReviewScores(content);
    expect(result).not.toBeNull();
    expect(result!.total).toBe(7);
  });

  it("handles Scores section with surrounding whitespace in cells", () => {
    const content = `## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |

- **total**: 7.5
`;
    const result = parseReviewScores(content);
    expect(result).not.toBeNull();
    expect(result!.categories["correctness"]?.score).toBe(8);
    expect(result!.total).toBe(7.5);
  });
});
