/**
 * Unit tests for parseReviewVerdict (shared verdict parser)
 *
 * TC-018: parseReviewVerdict が approved を正しく抽出する (should)
 * TC-019: parseReviewVerdict が needs-fix を正しく抽出する (should)
 * TC-020: parseReviewVerdict が escalation を正しく抽出する (should)
 * TC-021: parseReviewVerdict が verdict 行がない場合に null を返す (should)
 * TC-022: parseSpecReviewVerdict が parseReviewVerdict に委譲する (should)
 * TC-035: parseReviewVerdict が不正形式の verdict 値に対して null を返す (could)
 */
import { describe, it, expect } from "vitest";
import { parseReviewVerdict } from "../../../src/core/parser/review-verdict.js";
import { parseSpecReviewVerdict } from "../../../src/core/step/spec-review.js";

// TC-018: approved
describe("TC-018: parseReviewVerdict が approved を正しく抽出する", () => {
  it("returns 'approved' for line '- **verdict**: approved'", () => {
    const content = "# Code Review Feedback\n\n- **verdict**: approved\n\n## Findings\n";
    expect(parseReviewVerdict(content)).toBe("approved");
  });
});

// TC-019: needs-fix
describe("TC-019: parseReviewVerdict が needs-fix を正しく抽出する", () => {
  it("returns 'needs-fix' for line '- **verdict**: needs-fix'", () => {
    const content = "- **verdict**: needs-fix\n";
    expect(parseReviewVerdict(content)).toBe("needs-fix");
  });
});

// TC-020: escalation
describe("TC-020: parseReviewVerdict が escalation を正しく抽出する", () => {
  it("returns 'escalation' for line '- **verdict**: escalation'", () => {
    const content = "- **verdict**: escalation\n";
    expect(parseReviewVerdict(content)).toBe("escalation");
  });
});

// TC-021: missing verdict line
describe("TC-021: parseReviewVerdict が verdict 行がない場合に null を返す", () => {
  it("returns null when no verdict line is present", () => {
    const content = "# Code Review\n\n## Summary\n\nNo verdict here.\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseReviewVerdict("")).toBeNull();
  });
});

// TC-022: parseSpecReviewVerdict delegates to parseReviewVerdict
describe("TC-022: parseSpecReviewVerdict が parseReviewVerdict に委譲する", () => {
  it("both return 'needs-fix' for the same content", () => {
    const content = "- **verdict**: needs-fix\n";
    expect(parseReviewVerdict(content)).toBe("needs-fix");
    expect(parseSpecReviewVerdict(content)).toBe("needs-fix");
  });

  it("both return null for content with no verdict line", () => {
    const content = "No verdict here.";
    expect(parseReviewVerdict(content)).toBeNull();
    expect(parseSpecReviewVerdict(content)).toBeNull();
  });
});

// TC-008: existing pattern (- **verdict**: approved) — regression guard
describe("TC-008: parseReviewVerdict が既存パターン（- **verdict**: approved）にマッチする", () => {
  it("returns 'approved' for '- **verdict**: approved'", () => {
    const content = "- **verdict**: approved\n";
    expect(parseReviewVerdict(content)).toBe("approved");
  });
});

// TC-009: uppercase V + bold (**Verdict**: approved)
describe("TC-009: parseReviewVerdict が大文字 V + bold（**Verdict**: approved）にマッチする", () => {
  it("returns 'approved' for '**Verdict**: approved'", () => {
    const content = "**Verdict**: approved\n";
    expect(parseReviewVerdict(content)).toBe("approved");
  });

  it("returns 'needs-fix' for '**Verdict**: needs-fix'", () => {
    const content = "**Verdict**: needs-fix\n";
    expect(parseReviewVerdict(content)).toBe("needs-fix");
  });
});

// TC-010: no bold (Verdict: needs-fix)
describe("TC-010: parseReviewVerdict が bold なし（Verdict: needs-fix）にマッチする", () => {
  it("returns 'needs-fix' for 'Verdict: needs-fix'", () => {
    const content = "Verdict: needs-fix\n";
    expect(parseReviewVerdict(content)).toBe("needs-fix");
  });

  it("returns 'approved' for 'verdict: approved' (lowercase)", () => {
    const content = "verdict: approved\n";
    expect(parseReviewVerdict(content)).toBe("approved");
  });
});

// TC-011: - prefix + no bold (- verdict: escalation)
describe("TC-011: parseReviewVerdict が - prefix あり + bold なし（- verdict: escalation）にマッチする", () => {
  it("returns 'escalation' for '- verdict: escalation'", () => {
    const content = "- verdict: escalation\n";
    expect(parseReviewVerdict(content)).toBe("escalation");
  });
});

// TC-012: invalid verdict value rejected
describe("TC-012: parseReviewVerdict が不正な verdict 値を拒否する", () => {
  it("returns null for '**Verdict**: rejected'", () => {
    const content = "**Verdict**: rejected\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("returns null for 'Verdict: unknown'", () => {
    const content = "Verdict: unknown\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("returns null for 'Verdict: APPROVED' (uppercase value)", () => {
    const content = "Verdict: APPROVED\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("does not match --- (markdown horizontal rule)", () => {
    const content = "--- verdict: approved\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("does not match inline verdict (not at start of line)", () => {
    const content = "see: Verdict: approved for details\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });
});

// TC-035: invalid verdict value
describe("TC-035: parseReviewVerdict が不正形式の verdict 値に対して null を返す", () => {
  it("returns null for '- **verdict**: invalid-value'", () => {
    const content = "- **verdict**: invalid-value\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("returns null for '- **verdict**: APPROVED' (case mismatch)", () => {
    const content = "- **verdict**: APPROVED\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });

  it("returns null for inline verdict (not at start of line)", () => {
    const content = "text - **verdict**: approved more text\n";
    expect(parseReviewVerdict(content)).toBeNull();
  });
});
