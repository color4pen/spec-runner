/**
 * Unit tests for parseFindingSeverityCounts
 *
 * TC-RF-001: Findings テーブルから CRITICAL / HIGH / MEDIUM / LOW をカウントする (must)
 * TC-RF-002: テーブルが存在しない場合は全カウント 0 を返す (must)
 * TC-RF-003: mixed severity のカウントが正しい (must)
 * TC-RF-004: CRITICAL のみの場合のカウントが正しい (must)
 * TC-RF-005: severity 値の大文字小文字バリエーション (must)
 */
import { describe, it, expect } from "vitest";
import { parseFindingSeverityCounts } from "../../../src/core/parser/review-findings.js";

// TC-RF-001: 正常カウント
describe("TC-RF-001: Findings テーブルから CRITICAL / HIGH / MEDIUM / LOW をカウントする", () => {
  it("counts all severity levels correctly", () => {
    const content = `# Code Review

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | CRITICAL | security | src/auth.ts:10 | Auth bypass | Fix auth |
| 2 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |
| 3 | HIGH | performance | src/bar.ts:5 | N+1 query | Use batch |
| 4 | MEDIUM | maintainability | src/baz.ts:1 | Long function | Split up |
| 5 | LOW | style | src/qux.ts:99 | Missing comment | Add comment |

## Summary

Issues found.
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(2);
    expect(result.medium).toBe(1);
    expect(result.low).toBe(1);
  });
});

// TC-RF-002: テーブルなし
describe("TC-RF-002: テーブルが存在しない場合は全カウント 0 を返す", () => {
  it("returns all zeros when no Findings section", () => {
    const content = `# Code Review

No findings here.
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(0);
    expect(result.high).toBe(0);
    expect(result.medium).toBe(0);
    expect(result.low).toBe(0);
  });

  it("returns all zeros for empty string", () => {
    const result = parseFindingSeverityCounts("");
    expect(result.critical).toBe(0);
    expect(result.high).toBe(0);
    expect(result.medium).toBe(0);
    expect(result.low).toBe(0);
  });

  it("returns all zeros when Findings section has no table rows", () => {
    const content = `## Findings

No issues found.
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(0);
    expect(result.high).toBe(0);
    expect(result.medium).toBe(0);
    expect(result.low).toBe(0);
  });
});

// TC-RF-003: mixed severity
describe("TC-RF-003: mixed severity のカウントが正しい", () => {
  it("counts multiple items per severity level", () => {
    const content = `## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | a.ts:1 | Bug 1 | Fix 1 |
| 2 | HIGH | security | b.ts:2 | Bug 2 | Fix 2 |
| 3 | MEDIUM | maintainability | c.ts:3 | Issue 1 | Fix 3 |
| 4 | MEDIUM | architecture | d.ts:4 | Issue 2 | Fix 4 |
| 5 | MEDIUM | performance | e.ts:5 | Issue 3 | Fix 5 |
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(0);
    expect(result.high).toBe(2);
    expect(result.medium).toBe(3);
    expect(result.low).toBe(0);
  });
});

// TC-RF-004: CRITICAL のみ
describe("TC-RF-004: CRITICAL のみの場合のカウントが正しい", () => {
  it("counts only CRITICAL findings", () => {
    const content = `## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | CRITICAL | security | src/secret.ts:1 | Password in plain text | Encrypt |
| 2 | CRITICAL | correctness | src/data.ts:50 | Data corruption | Fix logic |
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(2);
    expect(result.high).toBe(0);
    expect(result.medium).toBe(0);
    expect(result.low).toBe(0);
  });
});

// TC-RF-005: severity 値の大文字小文字バリエーション
describe("TC-RF-005: severity 値の大文字小文字バリエーション", () => {
  it("counts lowercase severity values", () => {
    const content = `## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | critical | security | a.ts:1 | Issue | Fix |
| 2 | high | correctness | b.ts:2 | Issue | Fix |
| 3 | medium | maintainability | c.ts:3 | Issue | Fix |
| 4 | low | style | d.ts:4 | Issue | Fix |
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(1);
    expect(result.medium).toBe(1);
    expect(result.low).toBe(1);
  });

  it("counts mixed-case severity values", () => {
    const content = `## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | Critical | security | a.ts:1 | Issue | Fix |
| 2 | High | correctness | b.ts:2 | Issue | Fix |
`;
    const result = parseFindingSeverityCounts(content);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(1);
  });
});
