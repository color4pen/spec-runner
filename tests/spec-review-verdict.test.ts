import { describe, it, expect } from "vitest";
import { parseSpecReviewVerdict } from "../src/core/steps/spec-review.js";

// TC-001: parseSpecReviewVerdict — approved を正常パース
describe("TC-001: parseSpecReviewVerdict — approved", () => {
  it("returns 'approved' for a line containing '- **verdict**: approved'", () => {
    expect(parseSpecReviewVerdict("- **verdict**: approved")).toBe("approved");
  });
});

// TC-002: parseSpecReviewVerdict — needs-fix を正常パース
describe("TC-002: parseSpecReviewVerdict — needs-fix", () => {
  it("returns 'needs-fix' for a line containing '- **verdict**: needs-fix'", () => {
    expect(parseSpecReviewVerdict("- **verdict**: needs-fix")).toBe("needs-fix");
  });
});

// TC-003: parseSpecReviewVerdict — escalation を正常パース
describe("TC-003: parseSpecReviewVerdict — escalation", () => {
  it("returns 'escalation' for a line containing '- **verdict**: escalation'", () => {
    expect(parseSpecReviewVerdict("- **verdict**: escalation")).toBe("escalation");
  });
});

// TC-004: parseSpecReviewVerdict — 複数の verdict 行が存在する場合は最初を採用
describe("TC-004: parseSpecReviewVerdict — first-write-wins", () => {
  it("returns the first verdict when multiple verdict lines exist", () => {
    const content = "- **verdict**: needs-fix\n- **verdict**: approved";
    expect(parseSpecReviewVerdict(content)).toBe("needs-fix");
  });
});

// TC-005: parseSpecReviewVerdict — 大文字 "Approved" はマッチしない
describe("TC-005: parseSpecReviewVerdict — 'Approved' does not match", () => {
  it("returns null for '- **verdict**: Approved' (capital A)", () => {
    expect(parseSpecReviewVerdict("- **verdict**: Approved")).toBeNull();
  });
});

// TC-006: parseSpecReviewVerdict — "APPROVED" はマッチしない
describe("TC-006: parseSpecReviewVerdict — 'APPROVED' does not match", () => {
  it("returns null for '- **verdict**: APPROVED' (all caps)", () => {
    expect(parseSpecReviewVerdict("- **verdict**: APPROVED")).toBeNull();
  });
});

// TC-007: parseSpecReviewVerdict — コードブロック内の verdict 行はマッチしない
describe("TC-007: parseSpecReviewVerdict — code block verdict does not match", () => {
  it("returns null when verdict is wrapped in backticks (not at line start)", () => {
    // The backtick-wrapped line starts with a backtick, not '-', so it won't match
    const content = "`- **verdict**: approved`";
    expect(parseSpecReviewVerdict(content)).toBeNull();
  });
});

// TC-008: parseSpecReviewVerdict — 末尾スペースは許容される
describe("TC-008: parseSpecReviewVerdict — trailing spaces allowed", () => {
  it("returns 'approved' when line has trailing spaces", () => {
    expect(parseSpecReviewVerdict("- **verdict**: approved   ")).toBe("approved");
  });
});

// TC-009: parseSpecReviewVerdict — 先頭スペースがある行はマッチしない
describe("TC-009: parseSpecReviewVerdict — leading spaces not matched", () => {
  it("returns null when line has leading spaces", () => {
    expect(parseSpecReviewVerdict("  - **verdict**: approved")).toBeNull();
  });
});

// TC-010: parseSpecReviewVerdict — verdict 値が不正な文字列はマッチしない
describe("TC-010: parseSpecReviewVerdict — unknown verdict value not matched", () => {
  it("returns null for '- **verdict**: unknown-value'", () => {
    expect(parseSpecReviewVerdict("- **verdict**: unknown-value")).toBeNull();
  });
});

// TC-011: parseSpecReviewVerdict — 空文字列は null を返す (should)
describe("TC-011: parseSpecReviewVerdict — empty string returns null", () => {
  it("returns null for empty string", () => {
    expect(parseSpecReviewVerdict("")).toBeNull();
  });
});
